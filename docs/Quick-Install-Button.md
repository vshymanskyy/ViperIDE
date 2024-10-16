
## Distributing your own packages using ViperIDE

ViperIDE provides a convenient way to share your packages. This includes:

- Libraries, modules
- Demos, projects, code samples

For example, using this button you can install [`aiodns`](https://github.com/vshymanskyy/aiodns):

[<img src="https://raw.githubusercontent.com/vshymanskyy/ViperIDE/refs/heads/main/assets/btn_install.png" alt="Install using ViperIDE" height="48"/>](https://viper-ide.org/?install=github:vshymanskyy/aiodns)

## Creating a quick install link

Create a link in form of `https://viper-ide.org/?install=YOUR_LINK`. The link to can be one of:
  - `github:org/repo`
  - `github:org/repo/path/to/package.json`
  - `github:org/repo@branch-or-tag`
  - `gitlab:org/repo`
  - `gitlab:org/repo/path/to/package.json`
  - `gitlab:org/repo@branch-or-tag`
  - `http://example.com/version/x/y/package.json`
  - `http://example.com/version/x/y/foo.py`
  - `http://example.com/version/x/y/foo.mpy` (discouraged)

> [!IMPORTANT]
> Ensure that [CORS rules](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS) allow access to all the referenced files.
> This typically works for all files in GitHub and GitLab repositories.
> Notably, files in GitHub Releases don't work. You can also distribute your files via GitHub Pages.

## Insert the button image into your README.md

```md
[<img src="https://raw.githubusercontent.com/vshymanskyy/ViperIDE/refs/heads/main/assets/btn_install.png" alt="Install using ViperIDE" height="48"/>](https://viper-ide.org/?install=YOUR_LINK)
```

