# Security Policy

## Overview

Uncage is a local development tool. It runs entirely on your machine and does not expose any services to the internet. There is no authentication, no user accounts, and no remote data storage. The web interface is served on `localhost` and is only accessible from your own computer.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |

Only the latest release on the `main` branch receives updates and fixes.

## Threat Model

Because Uncage runs locally, the standard web application threat model does not apply. There are no untrusted users, no public endpoints, and no sensitive data transmitted over a network.

That said, the tool does process content from external websites (HTML, CSS, JavaScript, fonts, images). This content is saved to disk as static files. The tool does not execute downloaded JavaScript on the server side.

## What We Consider a Security Issue

- A bug that allows downloaded website content to escape the output directory (path traversal).
- A bug that causes Uncage to execute arbitrary code from a cloned website on your machine.
- A dependency vulnerability that could be exploited through normal use of the tool.

## What We Do Not Consider a Security Issue

- Cross-site scripting (XSS) in the localhost web interface. You are the only user.
- Information disclosure in error messages on localhost. You are the only viewer.
- Content from cloned websites containing malicious scripts. The tool saves files; it does not run them.
- Static analysis warnings (such as CodeQL alerts) that flag patterns designed for public web applications but do not apply to a local-only tool.

## Reporting a Vulnerability

If you find a genuine security issue, please report it privately:

1. Go to the GitHub repository.
2. Click the "Security" tab.
3. Click "Report a vulnerability" to open a private advisory.

Alternatively, open a regular issue if the matter is not sensitive.

We will acknowledge reports within 7 days and provide a fix or explanation as soon as possible.

## Dependencies

We keep dependencies up to date on a best-effort basis. If you notice a dependency with a known vulnerability, feel free to open an issue or submit a pull request.
