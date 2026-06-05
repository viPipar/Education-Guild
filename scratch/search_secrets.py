import json
import os

log_path = r"C:\Users\ROG STRIX\.gemini\antigravity-ide\brain\1a5ef4a1-788f-43ca-b105-799b06ca4318\.system_generated\logs\transcript.jsonl"

if os.path.exists(log_path):
    with open(log_path, 'r', encoding='utf-8') as f:
        for i, line in enumerate(f):
            if 'secrets set' in line or 'GOOGLE_PRIVATE_KEY' in line:
                try:
                    obj = json.loads(line)
                    # Print step index, type, and tool calls if any
                    print(f"Step {obj.get('step_index')}: Type: {obj.get('type')}")
                    if 'tool_calls' in obj:
                        for tc in obj['tool_calls']:
                            if tc['name'] == 'run_command':
                                print("Command:", tc['args'].get('CommandLine'))
                except Exception as e:
                    pass
else:
    print("Log file not found:", log_path)
