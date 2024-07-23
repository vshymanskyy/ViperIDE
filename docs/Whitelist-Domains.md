
## Whitelist Domains for ViperIDE

To ensure the correct functionality of the ViperIDE web app, IT departments are advised to unblock or whitelist the following domains:

- `viper-ide.org` - the main IDE server (currently hosted on GitHub Pages)
- `hub.viper-ide.org` - the collaborative features and remote device connection services

These domains must be allowed at least on the following levels (the list is not exhaustive):

1. **Network Firewall**: Ensure the domains and associated IP addresses are accessible through the network firewall.
2. **Content Filters**: Remove any content filtering that might block access to these domains.
3. **DNS Filtering**: Ensure that DNS filtering services allow requests to these domains.
4. **Proxy Servers**: Configure proxy servers to permit traffic to these domains.
5. **Browser Settings**: Check browser settings and ensure no site-specific restrictions are applied to these domains.
