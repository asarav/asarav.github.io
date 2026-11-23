source 'https://rubygems.org'

# The gems the site is built with, here and in the Pages workflow. The
# github-pages meta-gem is the fixed gem set GitHub's branch builds use
# (Jekyll 3.10 with a bundled plugin for every Pages feature), which pulled in
# ~60 unused gems and capped rubyzip below its patched release. The workflow in
# .github/workflows/pages.yml builds with this file instead, which is what
# GitHub recommends for Pages deployments now.
gem 'jekyll', '~> 4.4'
gem 'jekyll-seo-tag', '~> 2.8'
gem 'jekyll-sitemap', '~> 1.4'

# Ruby 3 dropped WEBrick from the standard library, and `jekyll serve` needs it.
gem 'webrick', '~> 1.9'
