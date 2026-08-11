//! Vertaalt de `--output-format stream-json`-regels van de claude-CLI naar
//! leesbare logregels voor het log-paneel. `claude -p` print in text-mode pas
//! na afloop; stream-json geeft per event één JSONL-regel, maar rauwe JSON is
//! onleesbaar in de UI.

use serde_json::Value;

/// Compacte weergave van een tool-input: het ene veld dat de actie typeert
/// (commando, pad, patroon), anders de hele input als compacte JSON.
const INPUT_KEYS: [&str; 7] = [
    "command",
    "file_path",
    "path",
    "pattern",
    "url",
    "query",
    "description",
];

/// Langere waarden zeggen in een logpaneel niets meer; afkappen op tekens
/// (niet bytes) zodat we nooit midden in een UTF-8-teken knippen.
const MAX_VALUE_CHARS: usize = 200;

fn truncate_chars(text: &str, max: usize) -> String {
    if text.chars().count() <= max {
        return text.to_string();
    }
    let cut: String = text.chars().take(max).collect();
    format!("{cut}…")
}

fn tool_use_line(block: &Value) -> String {
    let name = block.get("name").and_then(Value::as_str).unwrap_or("tool");
    let input = block.get("input");
    let detail = input.and_then(|input| {
        INPUT_KEYS
            .iter()
            .find_map(|key| input.get(key).and_then(Value::as_str))
            .map(str::to_string)
            .or_else(|| {
                let compact = input.to_string();
                (compact != "{}" && compact != "null").then_some(compact)
            })
    });
    match detail {
        Some(detail) => {
            // Een meergeregeld commando op één logregel houden.
            let single = detail.replace('\n', " ");
            format!(
                "» {name}: {}",
                truncate_chars(single.trim(), MAX_VALUE_CHARS)
            )
        }
        None => format!("» {name}"),
    }
}

fn assistant_lines(event: &Value, out: &mut Vec<String>) {
    let Some(blocks) = event.pointer("/message/content").and_then(Value::as_array) else {
        return;
    };
    for block in blocks {
        match block.get("type").and_then(Value::as_str) {
            Some("text") => {
                if let Some(text) = block.get("text").and_then(Value::as_str) {
                    let trimmed = text.trim();
                    if !trimmed.is_empty() {
                        out.push(trimmed.to_string());
                    }
                }
            }
            Some("tool_use") => out.push(tool_use_line(block)),
            // Denkstappen zijn intern en vaak lang; de tekst- en tool-regels
            // vertellen al wat er gebeurt.
            _ => {}
        }
    }
}

/// Alleen fouten van tools zijn het melden waard: het gewone resultaat
/// beschrijft de agent zelf al in zijn volgende tekstregel.
fn tool_result_lines(event: &Value, out: &mut Vec<String>) {
    let Some(blocks) = event.pointer("/message/content").and_then(Value::as_array) else {
        return;
    };
    for block in blocks {
        let is_error = block
            .get("is_error")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        if !is_error {
            continue;
        }
        let content = match block.get("content") {
            Some(Value::String(text)) => text.clone(),
            Some(other) => other.to_string(),
            None => continue,
        };
        let first = content.lines().find(|line| !line.trim().is_empty());
        if let Some(first) = first {
            out.push(format!(
                "tool-fout: {}",
                truncate_chars(first.trim(), MAX_VALUE_CHARS)
            ));
        }
    }
}

fn result_lines(event: &Value, out: &mut Vec<String>) {
    let is_error = event
        .get("is_error")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    if is_error {
        if let Some(result) = event.get("result").and_then(Value::as_str) {
            out.push(truncate_chars(result.trim(), MAX_VALUE_CHARS * 4));
        }
    }
    let seconds = event
        .get("duration_ms")
        .and_then(Value::as_u64)
        .map(|ms| ms / 1000);
    match seconds {
        Some(seconds) => out.push(format!("klaar in {seconds}s")),
        None => out.push("klaar".to_string()),
    }
}

/// Eén regel uit de stroom naar nul of meer leesbare logregels. Regels die
/// geen stream-json zijn (stderr, warnings van de CLI zelf) gaan ongewijzigd
/// door, zodat fouten nooit stil verdwijnen.
pub fn readable_stream_lines(raw: &str) -> Vec<String> {
    if !raw.trim_start().starts_with('{') {
        return vec![raw.to_string()];
    }
    let Ok(event) = serde_json::from_str::<Value>(raw) else {
        // De CLI schrijft altijd geldige JSON, dus dit is per constructie een
        // regel die door MAX_LINE_BYTES is afgekapt: bijna altijd een groot
        // tool-resultaat dat we toch niet zouden tonen. Stil laten vallen;
        // echte foutmeldingen zijn platte tekst en gaan hierboven al door.
        return Vec::new();
    };
    let mut out = Vec::new();
    match event.get("type").and_then(Value::as_str) {
        Some("assistant") => assistant_lines(&event, &mut out),
        Some("user") => tool_result_lines(&event, &mut out),
        Some("result") => result_lines(&event, &mut out),
        // system (init, hooks, thinking_tokens) en rate_limit_event: ruis.
        Some(_) => {}
        // JSON zonder type-veld komt niet uit de stream: doorlaten.
        None => out.push(raw.to_string()),
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn non_json_lines_pass_through_unchanged() {
        assert_eq!(
            readable_stream_lines("warning: iets op stderr"),
            vec!["warning: iets op stderr".to_string()]
        );
    }

    #[test]
    fn system_and_rate_limit_events_are_dropped() {
        assert!(readable_stream_lines(r#"{"type":"system","subtype":"init"}"#).is_empty());
        assert!(
            readable_stream_lines(r#"{"type":"system","subtype":"thinking_tokens"}"#).is_empty()
        );
        assert!(readable_stream_lines(r#"{"type":"rate_limit_event"}"#).is_empty());
    }

    #[test]
    fn assistant_text_is_shown_and_thinking_is_dropped() {
        let event = r#"{"type":"assistant","message":{"content":[
            {"type":"thinking","thinking":"lang intern verhaal"},
            {"type":"text","text":"  De diff is gelezen.  "}
        ]}}"#;
        assert_eq!(
            readable_stream_lines(event),
            vec!["De diff is gelezen.".to_string()]
        );
    }

    #[test]
    fn tool_use_shows_the_typing_input_field() {
        let event = r#"{"type":"assistant","message":{"content":[
            {"type":"tool_use","name":"Bash","input":{"command":"gh pr diff 42","description":"Diff lezen"}},
            {"type":"tool_use","name":"Read","input":{"file_path":"/tmp/x.rs"}}
        ]}}"#;
        assert_eq!(
            readable_stream_lines(event),
            vec![
                "» Bash: gh pr diff 42".to_string(),
                "» Read: /tmp/x.rs".to_string()
            ]
        );
    }

    #[test]
    fn tool_use_without_known_keys_falls_back_to_compact_json() {
        let event = r#"{"type":"assistant","message":{"content":[
            {"type":"tool_use","name":"TodoWrite","input":{"todos":[1,2]}},
            {"type":"tool_use","name":"NoInput","input":{}}
        ]}}"#;
        assert_eq!(
            readable_stream_lines(event),
            vec![
                "» TodoWrite: {\"todos\":[1,2]}".to_string(),
                "» NoInput".to_string()
            ]
        );
    }

    #[test]
    fn multiline_commands_collapse_to_one_line() {
        let event = r#"{"type":"assistant","message":{"content":[
            {"type":"tool_use","name":"Bash","input":{"command":"git log \\\n--oneline"}}
        ]}}"#;
        let lines = readable_stream_lines(event);
        assert_eq!(lines.len(), 1);
        assert!(!lines[0].contains('\n'));
    }

    #[test]
    fn only_failing_tool_results_are_reported() {
        let event = r#"{"type":"user","message":{"content":[
            {"type":"tool_result","content":"alles goed"},
            {"type":"tool_result","is_error":true,"content":"Exit code 2\ngrep: geen match"}
        ]}}"#;
        assert_eq!(
            readable_stream_lines(event),
            vec!["tool-fout: Exit code 2".to_string()]
        );
    }

    #[test]
    fn result_reports_duration_and_errors() {
        assert_eq!(
            readable_stream_lines(r#"{"type":"result","subtype":"success","duration_ms":47500}"#),
            vec!["klaar in 47s".to_string()]
        );
        assert_eq!(
            readable_stream_lines(
                r#"{"type":"result","is_error":true,"result":"API error","duration_ms":2000}"#
            ),
            vec!["API error".to_string(), "klaar in 2s".to_string()]
        );
    }

    #[test]
    fn truncated_json_is_dropped() {
        let lines = readable_stream_lines(r#"{"type":"assistant","message":{"content":[{"ty"#);
        assert!(lines.is_empty());
    }

    #[test]
    fn long_values_are_capped_on_chars_not_bytes() {
        let text = "é".repeat(MAX_VALUE_CHARS + 10);
        let event = format!(
            r#"{{"type":"assistant","message":{{"content":[{{"type":"tool_use","name":"Bash","input":{{"command":"{text}"}}}}]}}}}"#
        );
        let lines = readable_stream_lines(&event);
        assert!(lines[0].ends_with('…'));
        assert_eq!(
            lines[0].chars().count(),
            "» Bash: ".chars().count() + MAX_VALUE_CHARS + 1
        );
    }
}
