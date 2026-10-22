# E11 - Email Automation

A local web UI (React + Vite, Geist font, black and white) for your n8n resume-email workflow.

```
Browser (localhost:5173)  ->  Vite proxy  ->  n8n webhook /webhook/e11  ->  SMTP (Gmail)
                                                        |-> sent_log.csv, stop.flag, resume/resume.pdf
```

The UI sends one request to n8n: `{ action: "send" | "stop" | "status" }`. n8n does the sending, the pauses and the logging. Closing the browser tab does not stop a run.

## Setup (Windows, Command Prompt)

### 1. Check Node
```
node -v
```
Needs 20.19 or newer (or 22.12+). n8n 2.x already needs this.

### 2. Put the project in a folder
Unzip `e11.zip` to `C:\Users\lenovo\e11`. You should have `C:\Users\lenovo\e11\e11-ui\package.json`.

### 3. Files n8n needs (in `C:\Users\lenovo\.n8n-files`)
```
C:\Users\lenovo\.n8n-files\resume\resume.pdf
C:\Users\lenovo\.n8n-files\sent_log.csv
```
`sent_log.csv` must start with this header line (keep your existing one):
```
email,first_name,company,sent_at
```
Create it if missing:
```
if not exist C:\Users\lenovo\.n8n-files\sent_log.csv echo email,first_name,company,sent_at> C:\Users\lenovo\.n8n-files\sent_log.csv
```

### 4. Start n8n (bound to this PC only)
```
set N8N_LISTEN_ADDRESS=127.0.0.1
npx n8n
```
Leave this window open.

### 5. Import the workflow
1. Open http://localhost:5678
2. Workflows -> menu (top right) -> **Import from file** -> pick `e11-workflow.json`
3. Open the **Config** node. Check `base_dir` = `C:/Users/lenovo/.n8n-files` and `sender_email`. Leave `api_token` alone.
4. Open the **Send Email** node. The credential should already say "SMTP account". If it shows empty, select it from the dropdown.
5. Click **Publish** (older n8n versions: switch the **Active** toggle on). The webhook only exists while the workflow is published.

### 6. Start the UI
Open a second Command Prompt:
```
cd C:\Users\lenovo\e11\e11-ui
npm install
npm run dev
```
Open http://localhost:5173. The pill at the top right should say **n8n connected**.

### 7. Use it
1. Upload a CSV (`first_name,last_name,email`). Invalid and duplicate emails are marked Skipped.
2. Edit subject and body. `{first_name}`, `{last_name}`, `{company}` are filled per contact. Click Preview to check.
3. Set "Emails this run" (default 40) and the pause range (default 20 to 45 s, max 60).
4. **First time: test with 2 or 3 of your own addresses.** Then send the real list.
5. Press **Send**, confirm, watch the progress bar. **Stop** ends the run after the current pause.
6. Anyone in the sent log is never emailed again. Export the log from the Sent log card.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Pill says "n8n offline", message mentions localhost:5678 | n8n not running | Start n8n (step 4) |
| "Webhook not found" | Workflow not published | Publish / activate it (step 5.5) |
| "Token mismatch" | `.env` and Config node disagree | Make `VITE_E11_TOKEN` in `e11-ui\.env` equal `api_token` in the Config node, then restart `npm run dev` |
| Progress stuck, "No progress for a while" | An n8n node failed | n8n -> Executions -> open the red run. SMTP login (App Password) is the usual cause |
| "The file is not accessible" in n8n | Folder not allowed | Keep `base_dir` at `C:/Users/lenovo/.n8n-files`, or set `N8N_RESTRICT_FILE_ACCESS_TO` to your folder before starting n8n |
| Contacts list empty after reload | Browser storage cleared | Upload the CSV again. The sent log lives in n8n, not the browser |

## Notes
- Change the token: edit `VITE_E11_TOKEN` in `.env` and `api_token` in the Config node to the same new value.
- Production build: `npm run build` then `npm run preview` (same port, same proxy).
- n8n has to stay running and the PC awake for the whole run.
- Your old "Send Resume Emails" workflow is untouched and can stay as it is.
