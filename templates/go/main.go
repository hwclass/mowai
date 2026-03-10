package main

import (
	"example.com/internal/mowai/agent"
	"fmt"
)

func init() {
	agent.Exports.OnInit = func() {
		agent.Imports.Log("info", "Go agent initialised")
	}

	agent.Exports.GetInfo = func() agent.AgentInfo {
		cfg := agent.Imports.GetConfig()
		return agent.AgentInfo{
			Name:    cfg.Name,
			Version: "0.1.0",
			Color:   cfg.Color,
			Persona: cfg.Persona,
		}
	}

	agent.Exports.HandleTask = func(taskDescription string) string {
		agent.Imports.Log("info", fmt.Sprintf("Received task: %s", taskDescription))
		prompt := "Task for the swarm: " + taskDescription +
			"\n\nRespond in character. Be concise (\u2264 100 words)."
		response := agent.Imports.HostLlm(prompt)
		agent.Imports.Broadcast(response)
		return response
	}

	agent.Exports.OnPeerThought = func(peerId, thought string) {
		// Optional: react to peer reasoning
		_ = peerId
		_ = thought
	}
}

func main() {}
