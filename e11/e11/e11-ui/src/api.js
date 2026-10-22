// All calls go to one n8n webhook: POST /webhook/e11  { action: 'send' | 'stop' | 'status', ... }
const URL = '/n8n/webhook/e11'
const TOKEN = import.meta.env.VITE_E11_TOKEN

export class ApiError extends Error {
  constructor(kind, message) {
    super(message)
    this.kind = kind // 'network' | 'inactive' | 'auth' | 'server'
  }
}

async function call(action, payload = {}) {
  let res
  try {
    res = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-e11-token': TOKEN },
      body: JSON.stringify({ action, ...payload }),
    })
  } catch {
    throw new ApiError('network', 'Cannot reach n8n on localhost:5678. Is it running?')
  }
  if (res.status === 404) {
    throw new ApiError('inactive', 'Webhook not found. Import the E11 workflow and switch it to Active in n8n.')
  }
  if (res.status === 401 || res.status === 403) {
    throw new ApiError('auth', 'Token mismatch. VITE_E11_TOKEN in .env must equal api_token in the n8n Config node.')
  }
  const text = await res.text()
  const webhookNotRegistered = /requested webhook .* is not registered/i.test(text)
  if (webhookNotRegistered) {
    throw new ApiError('inactive', 'n8n is running, but the E11 workflow is not published. Open it in n8n, click Publish (or activate it), then retry.')
  }
  if (!res.ok) {
    let detail = ''
    try {
      const data = text ? JSON.parse(text) : null
      detail = data?.message || data?.error || data?.description || ''
    } catch {
      detail = text.trim()
    }
    throw new ApiError(
      'server',
      `n8n returned ${res.status}${detail ? `: ${detail}` : '. Check the Executions tab in n8n.'}`,
    )
  }
  try {
    return text ? JSON.parse(text) : {}
  } catch {
    return {}
  }
}

export const getStatus = () => call('status')
export const stopRun = () => call('stop')
export const startRun = (payload) => call('send', payload)
