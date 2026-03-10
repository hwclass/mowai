wit_bindgen::generate!({
    world: "agent-world",
    path: "wit/agent.wit",
});

struct MowaiAgent;

impl Guest for MowaiAgent {
    fn on_init() {
        log("info", "Agent initialised");
    }

    fn get_info() -> AgentInfo {
        // name/color/persona come from host via get-config import
        // (resolved at runtime from mowai.config.json, not compiled in)
        let cfg = get_config();
        AgentInfo {
            name: cfg.name,
            version: "0.1.0".into(),
            color: cfg.color,
            persona: cfg.persona,
        }
    }

    fn handle_task(task_description: String) -> String {
        log("info", &format!("Received task: {task_description}"));
        let prompt = format!(
            "Task for the swarm: {task_description}\n\nRespond in character. Be concise (\u{2264} 100 words)."
        );
        // host-llm import prepends persona system prompt automatically
        let response = host_llm(&prompt);
        broadcast(&response);
        response
    }

    fn on_peer_thought(_peer_id: String, _thought: String) {
        // Optional: react to peer reasoning
    }
}

export!(MowaiAgent);
