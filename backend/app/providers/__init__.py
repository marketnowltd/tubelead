"""Search Everywhere: independent discovery providers behind one interface.

Rules every provider follows
- It only calls an official API or licensed source, with a key the owner configured on the server.
- If its key is missing it reports NOT_CONFIGURED and makes no request. It never returns invented results.
- Errors are contained: a provider that fails returns an error status; the other providers still run.
"""
