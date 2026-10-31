# Third-party notices

## Javis603/token-monitor

Token Monitor's provider approach (which local sign-in to read, which usage endpoint to call, and
how to label the windows) is adapted from [Javis603/token-monitor](https://github.com/Javis603/token-monitor),
written fresh rather than copied. Relevant upstream commits:

- `b01f2f33` — Claude and Codex limits (Claude OAuth usage endpoint, Codex app-server RPC)
- `cc79febc` — Codex limits over ChatGPT's usage endpoint
- `b8303bbe`, `3e82f76a` — Cursor limits and reading Cursor's local sign-in (planned here)

```
MIT License

Copyright (c) 2026 Javis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Earlier project history

Before this restart, the repository was Token Guardian, built on
[xiufengsun/TokenTracker](https://github.com/xiufengsun/TokenTracker) (MIT, Copyright (c) 2026 xiufengsun).
That code is preserved unchanged on the `archive/guardian-v1` branch with its original license and
notices. None of it is included in this version.
