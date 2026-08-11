use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use keyring::Entry;
use serde::{Deserialize, Serialize};

const KEYRING_SERVICE: &str = "nl.dennispassway.accord";
const KEYRING_USER: &str = "github-token";
const DEVICE_CODE_URL: &str = "https://github.com/login/device/code";
const ACCESS_TOKEN_URL: &str = "https://github.com/login/oauth/access_token";

static HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

fn http_client() -> &'static reqwest::Client {
    HTTP_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(Duration::from_secs(15))
            .build()
            .expect("failed to build reqwest client")
    })
}

/// In-memory spiegel van de keychain-entry: `None` betekent "nog niet gelezen
/// of ongeldig gemaakt", `Some(token)` is de laatst bekende waarde (zelf ook
/// weer een Option, want "geen token" is een geldige uitkomst). Voorkomt dat
/// elke `get_token` opnieuw de keychain (en dus mogelijk een systeemprompt)
/// aanroept.
static TOKEN_CACHE: OnceLock<Mutex<Option<Option<String>>>> = OnceLock::new();

fn token_cache() -> &'static Mutex<Option<Option<String>>> {
    TOKEN_CACHE.get_or_init(|| Mutex::new(None))
}

/// Single-flight-lock rond de keychain-read: bij het opstarten roepen meerdere
/// hooks tegelijk `get_token` aan terwijl de cache nog leeg is, en zonder lock
/// geeft elke aanroep een eigen keychain-prompt.
static KEYCHAIN_READ_LOCK: OnceLock<tauri::async_runtime::Mutex<()>> = OnceLock::new();

fn keychain_read_lock() -> &'static tauri::async_runtime::Mutex<()> {
    KEYCHAIN_READ_LOCK.get_or_init(|| tauri::async_runtime::Mutex::new(()))
}

fn set_cached_token(token: Option<String>) {
    if let Ok(mut cache) = token_cache().lock() {
        *cache = Some(token);
    }
}

fn invalidate_token_cache() {
    if let Ok(mut cache) = token_cache().lock() {
        *cache = None;
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceLoginStart {
    pub user_code: String,
    pub verification_uri: String,
    pub device_code: String,
    pub interval: u64,
    pub expires_in: u64,
}

#[derive(Debug, Deserialize)]
struct DeviceCodeResponse {
    device_code: String,
    user_code: String,
    verification_uri: String,
    interval: u64,
    expires_in: u64,
}

#[derive(Debug, Serialize)]
#[serde(tag = "status")]
pub enum PollResult {
    #[serde(rename = "success")]
    Success { token: String },
    #[serde(rename = "pending")]
    Pending,
    #[serde(rename = "slowDown")]
    SlowDown { interval: u64 },
    #[serde(rename = "expired")]
    Expired,
    #[serde(rename = "denied")]
    Denied,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum AccessTokenResponse {
    Success {
        access_token: String,
    },
    Error {
        error: String,
        interval: Option<u64>,
    },
}

fn keyring_entry() -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn start_device_login(client_id: String) -> Result<DeviceLoginStart, String> {
    let client = http_client();
    let response = client
        .post(DEVICE_CODE_URL)
        .header("Accept", "application/json")
        // repo-scope is nodig: de app plaatst reviews en merget PR's
        .form(&[
            ("client_id", client_id.as_str()),
            ("scope", "repo read:org"),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!("GitHub gaf status {}", response.status()));
    }

    let body: DeviceCodeResponse = response.json().await.map_err(|e| e.to_string())?;

    Ok(DeviceLoginStart {
        user_code: body.user_code,
        verification_uri: body.verification_uri,
        device_code: body.device_code,
        interval: body.interval,
        expires_in: body.expires_in,
    })
}

#[tauri::command]
pub async fn poll_device_login(
    client_id: String,
    device_code: String,
) -> Result<PollResult, String> {
    let client = http_client();
    let response = client
        .post(ACCESS_TOKEN_URL)
        .header("Accept", "application/json")
        .form(&[
            ("client_id", client_id.as_str()),
            ("device_code", device_code.as_str()),
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!("GitHub gaf status {}", response.status()));
    }

    let body: AccessTokenResponse = response.json().await.map_err(|e| e.to_string())?;

    match body {
        AccessTokenResponse::Success { access_token } => {
            let token = access_token.clone();
            tauri::async_runtime::spawn_blocking(move || {
                keyring_entry()?
                    .set_password(&token)
                    .map_err(|e| e.to_string())
            })
            .await
            .map_err(|e| format!("kon token niet opslaan: {e}"))??;
            set_cached_token(Some(access_token.clone()));
            Ok(PollResult::Success {
                token: access_token,
            })
        }
        AccessTokenResponse::Error { error, interval } => match error.as_str() {
            "authorization_pending" => Ok(PollResult::Pending),
            "slow_down" => Ok(PollResult::SlowDown {
                interval: interval.unwrap_or(5),
            }),
            "expired_token" => Ok(PollResult::Expired),
            "access_denied" => Ok(PollResult::Denied),
            other => Err(format!("Onbekende fout van GitHub: {}", other)),
        },
    }
}

/// Async zodat een trage of hangende keychain-prompt de UI niet blokkeert; een
/// in-memory cache spaart de meeste herhaalde aanroepen zelfs de spawn uit.
#[tauri::command]
pub async fn get_token() -> Result<Option<String>, String> {
    if let Some(cached) = token_cache().lock().ok().and_then(|c| c.clone()) {
        return Ok(cached);
    }
    let _guard = keychain_read_lock().lock().await;
    // Her-check: een parallelle aanroep kan de cache al gevuld hebben terwijl
    // wij op de lock wachtten.
    if let Some(cached) = token_cache().lock().ok().and_then(|c| c.clone()) {
        return Ok(cached);
    }
    tauri::async_runtime::spawn_blocking(|| {
        let token = match keyring_entry()?.get_password() {
            Ok(token) => Ok(Some(token)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e.to_string()),
        }?;
        set_cached_token(token.clone());
        Ok(token)
    })
    .await
    .map_err(|e| format!("kon token niet lezen: {e}"))?
}

#[tauri::command]
pub async fn logout() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(|| {
        let result = match keyring_entry()?.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        };
        invalidate_token_cache();
        result
    })
    .await
    .map_err(|e| format!("kon niet uitloggen: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    // Eén test voor beide functies: de cache is een process-global static, dus
    // twee losse tests zouden elkaars staat kunnen overschrijven als cargo ze
    // parallel draait.
    #[test]
    fn token_cache_stores_and_invalidates() {
        invalidate_token_cache();
        assert_eq!(token_cache().lock().unwrap().clone(), None);

        set_cached_token(Some("abc".to_string()));
        assert_eq!(
            token_cache().lock().unwrap().clone(),
            Some(Some("abc".to_string()))
        );

        set_cached_token(None);
        assert_eq!(token_cache().lock().unwrap().clone(), Some(None));

        invalidate_token_cache();
        assert_eq!(token_cache().lock().unwrap().clone(), None);
    }
}
