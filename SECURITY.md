# Security policy

Report vulnerabilities privately to the repository maintainers instead of opening a public issue. Include affected versions, reproduction steps, and impact. Do not include real session cookies, pairing tokens, or scraped personal information.

The current supported version is `0.1.x`. Security-sensitive areas include extension permissions, loopback authentication, browser command validation, lead storage, and exported data.

The browser dashboard binds to `127.0.0.1`, issues an HttpOnly `SameSite=Strict` session cookie, requires same-origin browser mutations, and applies a restrictive Content Security Policy. CLI clients continue to use bearer authentication. Do not expose the daemon through a public proxy or change the bind address without adding a separate remote-access security model.
