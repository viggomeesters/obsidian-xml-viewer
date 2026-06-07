# Security Policy

## Supported versions

Only the latest release is actively supported.

## Reporting a vulnerability

Please report security issues privately by emailing the maintainer or opening a minimal GitHub security advisory if available.

Do not include sensitive vault content in public issues. If a reproduction requires XML content, reduce it to a minimal synthetic example first.

## Security posture

XML Viewer is read-only. It reads XML files through the vault API and renders a local view. It does not send vault content to external services, does not use runtime network APIs, does not read or write the system clipboard, and does not write XML files back to disk.

Runtime parsing uses the local `DOMParser` provided by the app environment. Test-only parser dependencies are not bundled into the release build.
