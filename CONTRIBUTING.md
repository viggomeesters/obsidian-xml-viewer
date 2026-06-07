# Contributing

Thanks for helping improve XML Viewer.

## Local setup

```bash
npm install
npm run build
npx tsc --noEmit
npm test
```

For manual testing, copy the repository into `.obsidian/plugins/xml-viewer/` in a test vault, reload the app, and open `.xml` files.

## Pull requests

- Keep the plugin read-only.
- Do not add network APIs in runtime plugin code.
- Do not add clipboard access without explicit user action and documentation.
- Preserve parser fixture coverage for nested elements, attributes, namespaces, SOAP, comments, CDATA, processing instructions, malformed XML, and render caps.
- Run build, typecheck, and tests before opening a PR.

## Release assets

Community releases must include:

- `main.js`
- `manifest.json`
- `styles.css`
