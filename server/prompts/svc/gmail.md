# Gmail

## OAuth

Gmail requires OAuth 2.0 — no PAT or API key option for accessing user emails.

Google requires both `client_id` and `client_secret` for Desktop apps. The app handles the full browser OAuth flow automatically — the user just provides the client credentials and authorizes in the browser.

### Prerequisites

The user must create a Google Cloud project and OAuth credentials:

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a project (or select existing)
3. Enable the **Gmail API** at [APIs & Services > Library](https://console.cloud.google.com/apis/library/gmail.googleapis.com)
4. Create OAuth credentials: **Create Credentials > OAuth client ID > Desktop app**
5. Copy the Client ID and Client Secret

### Collect credentials

```json
{
  "service": "gmail",
  "title": "Gmail OAuth Setup",
  "description": "Create a Desktop OAuth app in Google Cloud Console, enable the Gmail API, then paste the Client ID and Secret below",
  "link": "https://console.cloud.google.com/apis/credentials",
  "fields": [
    { "name": "CLIENT_ID", "label": "Client ID", "type": "text" },
    { "name": "CLIENT_SECRET", "label": "Client Secret", "type": "password" }
  ],
  "oauth": {
    "authUrl": "https://accounts.google.com/o/oauth2/v2/auth",
    "tokenUrl": "https://oauth2.googleapis.com/token",
    "scopes": ["https://www.googleapis.com/auth/gmail.modify"],
    "tokenKey": "TOKEN"
  }
}
```

### Scopes reference

| Scope | Access |
|-------|--------|
| `gmail.readonly` | Read-only access to messages and labels |
| `gmail.modify` | Read, send, delete, and manage messages (recommended) |
| `gmail.compose` | Create and send messages only |
| `gmail.send` | Send messages only |

Use `gmail.modify` unless the user requests narrower access.

### Register

```json
{
  "id": "gmail",
  "label": "Gmail",
  "baseUrl": "https://gmail.googleapis.com/gmail/v1",
  "icon": "https://ssl.gstatic.com/ui/v1/icons/mail/rfr/gmail.ico",
  "auth": { "strategy": "oauth", "secretRef": "${svc.gmail.TOKEN}" },
  "oauth": {
    "tokenUrl": "https://oauth2.googleapis.com/token",
    "clientIdKey": "${svc.gmail.CLIENT_ID}",
    "clientSecretKey": "${svc.gmail.CLIENT_SECRET}",
    "refreshKey": "${svc.gmail.REFRESH_TOKEN}"
  },
  "endpoints": [
    { "name": "get_profile", "description": "Get the authenticated user email profile", "input": {}, "output": {}, "transport": { "type": "rest", "method": "GET", "path": "/users/me/profile" } },
    { "name": "list_labels", "description": "List all Gmail labels for the user", "input": {}, "output": {}, "transport": { "type": "rest", "method": "GET", "path": "/users/me/labels" } },
    { "name": "list_messages", "description": "List emails, optionally filtered by search query", "input": { "q": { "type": "string", "optional": true, "description": "Gmail search query e.g. from:boss@company.com is:unread" }, "maxResults": { "type": "number", "optional": true, "default": 10 }, "pageToken": { "type": "string", "optional": true }, "labelIds": { "type": "string", "optional": true, "description": "Label ID to filter by" } }, "output": {}, "transport": { "type": "rest", "method": "GET", "path": "/users/me/messages" } },
    { "name": "get_message", "description": "Fetch full content of a single email by ID", "input": { "id": { "type": "string", "description": "Message ID" }, "format": { "type": "enum", "values": ["full", "minimal", "raw", "metadata"], "optional": true, "default": "full" } }, "output": {}, "transport": { "type": "rest", "method": "GET", "path": "/users/me/messages/{id}" } },
    { "name": "send_message", "description": "Send an email as base64url-encoded RFC 2822 message", "input": { "raw": { "type": "string", "format": "base64url", "description": "Base64url-encoded RFC 2822 message with To, From, Subject headers and body" } }, "output": {}, "transport": { "type": "rest", "method": "POST", "path": "/users/me/messages/send" } },
    { "name": "trash_message", "description": "Move an email to the trash", "input": { "id": { "type": "string", "description": "Message ID to trash" } }, "output": {}, "transport": { "type": "rest", "method": "POST", "path": "/users/me/messages/{id}/trash" } },
    { "name": "modify_message", "description": "Modify labels on a message (add or remove)", "input": { "id": { "type": "string", "description": "Message ID" }, "addLabelIds": { "type": "array", "items": "string", "optional": true }, "removeLabelIds": { "type": "array", "items": "string", "optional": true } }, "output": {}, "transport": { "type": "rest", "method": "POST", "path": "/users/me/messages/{id}/modify" } },
    { "name": "list_threads", "description": "List email threads, optionally filtered", "input": { "q": { "type": "string", "optional": true, "description": "Gmail search query" }, "maxResults": { "type": "number", "optional": true, "default": 10 }, "pageToken": { "type": "string", "optional": true } }, "output": {}, "transport": { "type": "rest", "method": "GET", "path": "/users/me/threads" } },
    { "name": "get_thread", "description": "Fetch a full email thread by ID", "input": { "id": { "type": "string", "description": "Thread ID" }, "format": { "type": "enum", "values": ["full", "minimal", "metadata"], "optional": true, "default": "full" } }, "output": {}, "transport": { "type": "rest", "method": "GET", "path": "/users/me/threads/{id}" } },
    { "name": "list_drafts", "description": "List email drafts for the user", "input": { "maxResults": { "type": "number", "optional": true, "default": 10 } }, "output": {}, "transport": { "type": "rest", "method": "GET", "path": "/users/me/drafts" } },
    { "name": "create_draft", "description": "Create an email draft with base64url-encoded RFC 2822 message", "input": { "raw": { "type": "string", "format": "base64url", "description": "Base64url-encoded RFC 2822 message" } }, "output": {}, "transport": { "type": "rest", "method": "POST", "path": "/users/me/drafts" } }
  ]
}
```

### Verify

Endpoint: `get_profile` — returns the authenticated user's email address. No parameters needed.

### Notes

- `baseUrl` already includes `/gmail/v1` — endpoint paths start from `/users/me/...`
- `send_message` and `create_draft` require `raw` as base64url-encoded RFC 2822 — the proxy validates this format before sending
- Gmail `modify_message` is used for archiving (remove `INBOX`), starring (add `STARRED`), marking read (remove `UNREAD`)
- Token refresh is automatic on 401 when `oauth` config is present
