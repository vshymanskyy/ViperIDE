
## Sharing Your Projects Using ViperIDE

ViperIDE makes it easy to distribute packages, including:

- Libraries and modules
- Applications, projects, demos and code samples

For instance, you can install [`aiodns`](https://github.com/vshymanskyy/aiodns) using the following button:

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

## Showing a Readme

When the link is opened, ViperIDE fetches your `package.json` and, if it has a `readme` field, opens that document in a tab. This lets people read what the package does before connecting a device and installing it.

The `readme` value is a link in the same forms as above, so a plain file name is resolved relative to the `package.json` it is written in, and `@branch-or-tag` from the install link is respected.

The document is rendered as Markdown. Links and images inside it are resolved the same way as the fields above: relative to the readme itself, so `![](img/demo.png)` and `github:`/`gitlab:` links both work, and a `https://github.com/org/repo/blob/...` page resolves to the file it shows.

Links are shown but **not clickable** - due to security reasons, the readme is not allowed to navigate the user away. Write out any links you want people to be able to open.

## Adding the Install Button to Your README.md

To insert the install button into your `README.md`, use the following markdown code:

```md
[<img src="https://raw.githubusercontent.com/vshymanskyy/ViperIDE/refs/heads/main/assets/btn_install.png" alt="Install using ViperIDE" height="48"/>](https://viper-ide.org/?install=YOUR_LINK)
```
