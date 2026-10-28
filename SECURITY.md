# Security

## Reporting a problem

Please report security problems privately through
[GitHub's private reporting](https://github.com/dao-wolf/system-design-quest/security/advisories/new),
not in a public issue. Only the latest release gets fixes.

## What could go wrong

The game runs only in your browser. It has no server and no accounts.

- **Inputs:** the optional profile, a loaded save file and the element's
  attributes. The game checks each one before use and keeps the profile out of
  the page address, the title and every request.
- **Content:** everything shows as plain text. Nothing writes raw HTML.
- **Supply chain:** automated tools scan the dependencies and workflows, and
  GitHub signs each release, so a site using it can check where it came from.
