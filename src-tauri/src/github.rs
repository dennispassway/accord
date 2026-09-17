//! HTTP naar GitHub vanuit Rust in plaats van vanuit de webview.
//!
//! De aanleiding is dat WKWebView elke mislukte load op één string gooit,
//! `TypeError: Load failed`, waardoor de frontend geen onderscheid kon maken
//! tussen "hostnaam niet te vinden", "verbinding weg" en "door de CSP
//! geblokkeerd". reqwest weet wél waarom het misging, dus die oorzaak reist
//! hier als een getagd kind mee naar de UI.

use std::collections::HashMap;
use std::sync::OnceLock;
use std::time::Duration;

use serde::{Deserialize, Serialize};

/// Gelijk aan de timeout die de frontend in zijn melding noemt.
const TIMEOUT: Duration = Duration::from_secs(15);

static HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

fn http_client() -> &'static reqwest::Client {
    HTTP_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(TIMEOUT)
            .user_agent(concat!("accord/", env!("CARGO_PKG_VERSION")))
            .build()
            .expect("failed to build reqwest client")
    })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubRequest {
    url: String,
    method: String,
    #[serde(default)]
    headers: HashMap<String, String>,
    #[serde(default)]
    body: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubResponse {
    status: u16,
    headers: HashMap<String, String>,
    body: String,
}

/// Waar het misging. De frontend vertaalt dit naar een melding; `Other` houdt
/// de oorspronkelijke tekst vast zodat een onbekend geval nog te herkennen is.
#[derive(Debug, Serialize, PartialEq, Eq, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub enum TransportErrorKind {
    Timeout,
    Dns,
    Connect,
    Tls,
    Body,
    Other,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TransportError {
    kind: TransportErrorKind,
    message: String,
}

impl TransportError {
    fn new(kind: TransportErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }
}

/// Plakt de hele `source`-keten aan elkaar. reqwest legt de onderliggende
/// oorzaak niet als vraagbaar veld bloot, dus dit is de enige plek waar de
/// tekst nog te zien is.
fn error_chain(error: &dyn std::error::Error) -> String {
    let mut parts = vec![error.to_string()];
    let mut source = error.source();
    while let Some(inner) = source {
        parts.push(inner.to_string());
        source = inner.source();
    }
    parts.join(": ")
}

/// Leidt het kind af uit de vlaggen die reqwest wél biedt, en pas daarna uit
/// de foutketen. Een onherkenbare connect-fout blijft `Connect`: dat is nog
/// altijd specifieker dan de ene bak waar de webview alles in gooide.
pub fn classify(error: &reqwest::Error) -> TransportError {
    let chain = error_chain(error);
    let lower = chain.to_lowercase();

    let kind = if error.is_timeout() {
        TransportErrorKind::Timeout
    } else if error.is_body() || error.is_decode() {
        TransportErrorKind::Body
    } else if lower.contains("dns error")
        || lower.contains("failed to lookup address")
        || lower.contains("name or service not known")
        || lower.contains("nodename nor servname")
    {
        TransportErrorKind::Dns
    } else if lower.contains("tls") || lower.contains("certificate") || lower.contains("handshake")
    {
        TransportErrorKind::Tls
    } else if error.is_connect() || error.is_request() {
        TransportErrorKind::Connect
    } else {
        TransportErrorKind::Other
    };

    TransportError::new(kind, chain)
}

#[tauri::command]
pub async fn github_request(request: GithubRequest) -> Result<GithubResponse, TransportError> {
    let method = reqwest::Method::from_bytes(request.method.as_bytes())
        .map_err(|_| TransportError::new(TransportErrorKind::Other, "onbekende HTTP-methode"))?;

    let mut builder = http_client().request(method, &request.url);
    for (name, value) in &request.headers {
        builder = builder.header(name, value);
    }
    if let Some(body) = request.body {
        builder = builder.body(body);
    }

    let response = builder.send().await.map_err(|error| classify(&error))?;

    let status = response.status().as_u16();
    let headers = response
        .headers()
        .iter()
        .filter_map(|(name, value)| {
            value
                .to_str()
                .ok()
                .map(|value| (name.as_str().to_string(), value.to_string()))
        })
        .collect();

    // De body loopt over dezelfde verbinding als de headers: valt die hier
    // weg, dan is dat een aparte fout en geen leeg antwoord.
    let body = response.text().await.map_err(|error| classify(&error))?;

    Ok(GithubResponse {
        status,
        headers,
        body,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn error_for(url: &str) -> reqwest::Error {
        tauri::async_runtime::block_on(async {
            reqwest::Client::builder()
                .timeout(Duration::from_millis(2000))
                .build()
                .expect("client")
                .get(url)
                .send()
                .await
                .expect_err("verwacht een transportfout")
        })
    }

    #[test]
    fn een_onvindbare_hostnaam_wordt_dns() {
        // .invalid lost per RFC 2606 nooit op.
        let error = error_for("https://nonexistent-host-accord-test.invalid/x");
        assert_eq!(classify(&error).kind, TransportErrorKind::Dns);
    }

    #[test]
    fn een_gesloten_poort_wordt_connect() {
        // Poort 1 luistert niet: de hostnaam lost wel op, de verbinding niet.
        // Dwingt de andere tak af, zodat de test niet alleen het geval dekt
        // waar hij voor geschreven is.
        let error = error_for("http://127.0.0.1:1/");
        assert_eq!(classify(&error).kind, TransportErrorKind::Connect);
    }

    #[test]
    fn een_verlopen_timeout_wordt_timeout() {
        // 10.255.255.1 is niet routeerbaar: de verbinding blijft hangen tot
        // de timeout van de client verloopt.
        let error = error_for("http://10.255.255.1/");
        assert_eq!(classify(&error).kind, TransportErrorKind::Timeout);
    }

    #[test]
    fn het_kind_serialiseert_als_camelcase_tag() {
        let error = TransportError::new(TransportErrorKind::Dns, "boom");
        let json = serde_json::to_string(&error).expect("serialiseert");
        assert_eq!(json, r#"{"kind":"dns","message":"boom"}"#);
    }

    /// Neemt één aanvraag aan, geeft een vast antwoord terug en levert de
    /// ontvangen request-tekst op. Genoeg om te bewijzen dat methode, headers
    /// en body er echt uitgaan en dat status, headers en body terugkomen.
    fn eenmalige_server(response: &'static str) -> (String, std::thread::JoinHandle<String>) {
        use std::io::{Read, Write};
        use std::net::TcpListener;

        let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
        let port = listener.local_addr().expect("addr").port();
        let handle = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept");
            let mut buffer = [0u8; 4096];
            let read = stream.read(&mut buffer).expect("read");
            stream.write_all(response.as_bytes()).expect("write");
            stream.flush().expect("flush");
            String::from_utf8_lossy(&buffer[..read]).to_string()
        });
        (format!("http://127.0.0.1:{port}/graphql"), handle)
    }

    #[test]
    fn een_post_gaat_compleet_heen_en_terug() {
        let (url, server) = eenmalige_server(
            "HTTP/1.1 403 Forbidden\r\n\
             content-type: application/json\r\n\
             retry-after: 30\r\n\
             content-length: 26\r\n\
             connection: close\r\n\r\n\
             {\"message\":\"rate limited\"}",
        );

        let mut headers = HashMap::new();
        headers.insert("Authorization".to_string(), "Bearer t".to_string());
        headers.insert("Content-Type".to_string(), "application/json".to_string());

        let response = tauri::async_runtime::block_on(github_request(GithubRequest {
            url,
            method: "POST".to_string(),
            headers,
            body: Some(r#"{"query":"x"}"#.to_string()),
        }))
        .expect("een antwoord, geen transportfout");

        let request = server.join().expect("server-thread");
        assert!(request.starts_with("POST /graphql HTTP/1.1"), "{request}");
        assert!(request.contains("authorization: Bearer t"), "{request}");
        assert!(request.contains(r#"{"query":"x"}"#), "{request}");

        assert_eq!(response.status, 403);
        assert_eq!(
            response.headers.get("retry-after"),
            Some(&"30".to_string()),
            "de headers die rateLimitNote leest moeten meekomen"
        );
        assert!(response.body.contains("rate limited"));
    }
}
