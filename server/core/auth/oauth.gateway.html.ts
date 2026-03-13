const SUCCESS_HTML = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Sparky</title></head>
<body style="font-family:system-ui,-apple-system,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#fafafa;color:#1a1a1a">
  <div style="text-align:center">
    <div style="font-size:48px;margin-bottom:16px">&#10003;</div>
    <h2 style="margin:0 0 8px;font-weight:600">Sparky successfully connected</h2>
    <p style="margin:0;color:#666;font-size:14px">You can close this page.</p>
  </div>
</body>
</html>`;

const ERROR_HTML = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Sparky</title></head>
<body style="font-family:system-ui,-apple-system,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#fafafa;color:#1a1a1a">
  <div style="text-align:center">
    <div style="font-size:48px;margin-bottom:16px;color:#c00">&#10007;</div>
    <h2 style="margin:0 0 8px;font-weight:600;color:#c00">Authorization failed</h2>
    <p style="margin:0;color:#666;font-size:14px">Please close this page and try again.</p>
  </div>
</body>
</html>`;

function httpResponse(status: string, html: string): string {
  return `HTTP/1.1 ${status}\r\nContent-Type: text/html\r\nContent-Length: ${html.length}\r\nConnection: close\r\n\r\n${html}`;
}

export const successResponse = httpResponse("200 OK", SUCCESS_HTML);
export const errorResponse = httpResponse("400 Bad Request", ERROR_HTML);
