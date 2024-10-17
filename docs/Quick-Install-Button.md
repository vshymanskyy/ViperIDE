
## Sharing Your Projects Using ViperIDE

ViperIDE makes it easy to distribute packages, including:

- Libraries and modules
- Demos, projects, and code samples

For instance, you can install the `aiodns` package using the following button:

[<img src="https://raw.githubusercontent.com/vshymanskyy/ViperIDE/refs/heads/main/assets/btn_install.png" alt="Install using ViperIDE" height="48"/>](https://viper-ide.org/?install=github:vshymanskyy/aiodns)

## Creating a Quick Install Link

To create a quick install link, use the format `https://viper-ide.org/?install=YOUR_LINK`. The `YOUR_LINK` part can be one of the following:

- `github:org/repo`
- `github:org/repo/path/to/package.json`
- `github:org/repo@branch-or-tag`
- `gitlab:org/repo`
- `gitlab:org/repo/path/to/package.json`
- `gitlab:org/repo@branch-or-tag`
- `http://example.com/version/x/y/package.json`
- `http://example.com/version/x/y/foo.py`
- `http://example.com/version/x/y/foo.mpy` (not recommended)

> [!IMPORTANT]
> Make sure that [CORS rules](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS) allow access to the referenced files.
> This usually works for files hosted in GitHub and GitLab repositories.
> Note that files in GitHub Releases are not accessible via CORS. As an alternative, you can use GitHub Pages to distribute your files.

## Adding the Install Button to Your README.md

To insert the install button into your `README.md`, use the following markdown code:

```md
[<img src="https://raw.githubusercontent.com/vshymanskyy/ViperIDE/refs/heads/main/assets/btn_install.png" alt="Install using ViperIDE" height="48"/>](https://viper-ide.org/?install=YOUR_LINK)
```
