KidBookMaker static site for kidbookmaker.com

This repo is the whole site: plain static files, no build step.
Served by GitHub Pages from main / (root), custom domain kidbookmaker.com.

- Form submissions post to https://kidbookmaker.sites.tab.bot/api/submit, which accepts
  cross-origin posts from https://kidbookmaker.com and https://www.kidbookmaker.com.
  Nothing else needs to move.
- CNAME (contains kidbookmaker.com) is for GitHub Pages. Other hosts ignore it.
- Not indexed yet. To let Google index it (only when David says):
    1. In index.html, delete the line <meta name="robots" content="noindex, nofollow, noarchive">
    2. Replace robots.txt with:
         User-agent: *
         Allow: /
