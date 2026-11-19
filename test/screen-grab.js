// Captures the app window from the real screen (so Windows' glass effect is
// included), with the window kept on top so nothing else gets captured.
// `area` is optional: { x, y, width, height } inside the window, in window pixels.
const { execFileSync } = require('child_process');

module.exports = async function grab(app, file, area) {
  const rect = await app.evaluate(({ BrowserWindow, screen }, part) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.setAlwaysOnTop(true, 'screen-saver');
    w.focus();
    const b = w.getBounds();
    const r = part ? { x: b.x + part.x, y: b.y + part.y, width: part.width, height: part.height } : b;
    return screen.dipToScreenRect(w, r);
  }, area || null);
  await new Promise((r) => setTimeout(r, 700));
  const target = file.split('\\').join('/');
  const script = [
    'Add-Type -AssemblyName System.Drawing',
    "$s = Add-Type -MemberDefinition '[DllImport(\"user32.dll\")] public static extern bool SetProcessDPIAware();' -Name D -Namespace W -PassThru",
    '[void]$s::SetProcessDPIAware()',
    `$b = New-Object System.Drawing.Bitmap ${rect.width},${rect.height}`,
    '$g = [System.Drawing.Graphics]::FromImage($b)',
    `$g.CopyFromScreen(${rect.x},${rect.y},0,0,$b.Size)`,
    `$b.Save('${target}',[System.Drawing.Imaging.ImageFormat]::Png)`,
  ].join('; ');
  execFileSync('powershell', ['-NoProfile', '-Command', script]);
};
