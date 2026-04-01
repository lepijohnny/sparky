const ICON = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAADQklEQVR42sVYS08UQRCu7pld9oE8BHwkGjHGPcDF3YtGPRjjwRhMjCdvXv0F4k8Qf4AXEw+e9EJiDAEvhAsEE11QEyJoIqhRWBcJyMLszqOt6plZZicEe19QSWVmZ3qqvnp213LHcRgyByQhRBrvn+M1h+yIxhHJyqHsF3jNkC7SSbqlciRaMIjPH8L+0APG2BDpZp7lQeUWsobMGqxUINvIehAE81zyznvoIPMmWx/UkeGe9b7lfB/czz1d0vPkgRze93guYrX4ldUWDvrsNwFwmhBvZSC8HuWFbQFrfx1XknC5SmJVx9yyXSYySkKCICqaAlY3nOoRUJdQSl2UzRHu7GdT/j53NlL5XrhrdM0FqOFaxhoIwKf1giNj1pbkMPfVlAHs660Es4leSbQwCfh/pCtZjxDnlyzo7uDQ0+FKnfxQgqcjBRn3e7eSkDqpQ3bBhPP9UWiNq6fVngBIOLlxyxAw9bEI/acjCCAq3y0uW2BaArOIwadvFrydNzE8Jcit2XDnWqIcsroA+DEki25fiUMsumPZ9QsxWFlzwzFwMQavJg3p9s5DvOLbhuQAWWPZAqIRVi61sAKqiJU/Dpw6psFWUUALrtW4WlvcMwREY28MeDy8CT/ztlQsAnVPTDlC3iHlv1ZtePJyE17jN0EZNQEIh8O3mnsgyu+8RK2lISmFwHbcRkMxXlq24ehhXpEPQUsJZAnX6ppaGSoB8KuB3Do6bUA6FYWBSzF4Nbol3929kYCuNlfbNsaf8sFPxrpyIGwd9X1KsAKW5ciUAbNf3NIbmzbKa99jpxye2JbNSCUHlBqR78qbl+NwpFODTCoCC98tmMgWgekMeo/viDlzQof2Vg6JGFMqR+UyJMvDHW5u0ZTZ2IcNagNbNAlqT/LGb0a0wg5sNOQRHrIsuEmpdsGaNqP8uiM9QVXwI2dDHCujq52Xt2gC2ZTteLdyo6SMYg4kq9h8dgNw4EeyfOCgWPXJso4ZQUaUjuXjfsOr2n21A7C9Y/k4hSCN99kDG0xwPJrBm8HQ0CCaEe/Q8EOj2UxwOL2PD4f2KfkGUfkjOZzSiCzP5y6ItByXGLuKz7obWB1kfV7GnAZStNz7S0D8A+lwBUweUyRJAAAAAElFTkSuQmCC";

const SUCCESS_HTML = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Sparky</title></head>
<body style="font-family:system-ui,-apple-system,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#fafafa;color:#1a1a1a">
  <div style="text-align:center">
    <img src="${ICON}" width="48" height="48" style="margin-bottom:16px" alt="Sparky" />
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
    <img src="${ICON}" width="48" height="48" style="margin-bottom:16px;opacity:0.4" alt="Sparky" />
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
