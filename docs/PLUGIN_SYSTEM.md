# Plugin System Guide

Complete guide to the Bedrock Forge plugin system, including presets, categories, management commands, and best practices for optimal WordPress site setup.

## 📋 Table of Contents

- [Overview](#overview)
- [Plugin Presets](#plugin-presets)
- [Plugin Categories](#plugin-categories)
- [Plugin Management Commands](#plugin-management-commands)
- [Plugin Selection Guide](#plugin-selection-guide)
- [Integration with Workflows](#integration-with-workflows)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)
- [Advanced Usage](#advanced-usage)

## 🎯 Overview

The Bedrock Forge plugin system provides intelligent plugin management for WordPress sites with:

- **Smart Presets**: Pre-configured plugin collections for different site types
- **Dependency Resolution**: Automatic handling of plugin dependencies
- **Conflict Detection**: Warning about incompatible plugins
- **Category-Based Organization**: Plugins organized by function and priority
- **Parallel Installation**: Fast, concurrent plugin installation
- **Auto-Configuration**: Automatic setup of plugin settings where possible

## 🎨 Plugin Presets

Plugin presets are curated collections of plugins optimized for specific website types. Each preset includes essential plugins for that category, configured with sensible defaults.

### Available Presets

#### **Blog/Content Site** (`blog`)
*Essential plugins for blogging and content-focused websites*

**Includes:**
- Jetpack (site management and stats)
- WordPress SEO (search optimization)
- W3 Total Cache (performance)
- Wordfence (security)
- Akismet (spam protection)
- Google Site Kit (analytics integration)
- WP Statistics (visitor analytics)
- Duplicate Post (content creation)

**Use Case:** Personal blogs, news sites, content-heavy websites

#### **Business Website** (`business`) ⭐ *Default*
*Complete plugin set for professional business websites*

**Includes:**
- WordPress SEO (search optimization)
- W3 Total Cache (performance)
- Wordfence (security)
- Contact Form 7 (contact forms)
- Google Site Kit (analytics)
- Smush (image optimization)
- Redirection (URL management)
- Duplicate Page (content management)
- Really Simple SSL (security)

**Use Case:** Corporate websites, small business sites, professional portfolios

#### **E-commerce Store** (`ecommerce`)
*Plugins optimized for online stores and e-commerce*

**Includes:**
- WooCommerce (e-commerce platform)
- WordPress SEO (search optimization)
- W3 Total Cache (performance)
- Wordfence (security)
- Contact Form 7 (customer inquiries)
- Google Site Kit (analytics)
- WooCommerce Stripe Gateway (payments)
- PDF Invoices & Packing Slips (order management)
- WP Mail SMTP (email deliverability)
- Really Simple SSL (security)

**Use Case:** Online stores, product catalogs, digital downloads

#### **Portfolio/Creative** (`portfolio`)
*Plugins for portfolio, photography, and creative websites*

**Includes:**
- WordPress SEO (search optimization)
- W3 Total Cache (performance)
- Wordfence (security)
- Contact Form 7 (client inquiries)
- Smush (image optimization)
- Envira Gallery (portfolio galleries)
- Google Site Kit (analytics)
- Really Simple SSL (security)

**Use Case:** Photographer portfolios, artist galleries, creative agency sites

#### **Minimal Setup** (`minimal`)
*Basic essential plugins only*

**Includes:**
- Akismet (spam protection)
- Wordfence (security)
- Really Simple SSL (security)

**Use Case:** Development sites, minimal requirements, custom builds

#### **Performance Optimized** (`performance`)
*Maximum performance and speed optimization*

**Includes:**
- W3 Total Cache (advanced caching)
- Smush (image optimization)
- Autoptimize (CSS/JS optimization)
- Query Monitor (performance debugging)
- WordPress SEO (SEO optimization)
- Google Site Kit (analytics)
- Lazy Load by WP Anatomy (performance)
- WP Super Minify (optimization)

**Use Case:** High-traffic sites, performance-critical applications

## 📂 Plugin Categories

### Essential Plugins
Core plugins required for most WordPress installations.

- **Akismet Anti-Spam**: Protects from spam comments
- **Jetpack**: Comprehensive site management toolkit

### SEO & Marketing
Search engine optimization and marketing tools.

- **WordPress SEO (Yoast)**: Complete SEO solution with content analysis
- **Rank Math**: Advanced SEO with rich snippets
- **Google Site Kit**: Connect to Google services
- **Redirection**: Manage 301 redirects and 404 errors

### Performance & Caching
Speed optimization and caching solutions.

- **W3 Total Cache**: Comprehensive caching and optimization
- **WP Rocket**: Premium caching and performance
- **Smush**: Image compression and optimization
- **Autoptimize**: CSS, JavaScript, and HTML optimization
- **Query Monitor**: Database queries and debugging tool

### Security
Security and protection plugins.

- **Wordfence Security**: Security suite with firewall
- **Sucuri Security**: Security auditing and malware scanning
- **Really Simple SSL**: Automatic SSL configuration
- **UpdraftPlus**: Backup and restoration

### Forms & Contact
Contact forms and user interaction tools.

- **Contact Form 7**: Simple and flexible forms
- **WPForms Lite**: Drag and drop form builder
- **Elementor Pro**: Advanced form builder
- **Fluent Forms**: Advanced forms with conditional logic
- **WP Mail SMTP**: Email deliverability improvement

### E-commerce
Online store and e-commerce functionality.

- **WooCommerce**: Complete e-commerce platform
- **WooCommerce Stripe Gateway**: Credit card payments
- **PDF Invoices & Packing Slips**: Order management

### Media & Gallery
Image galleries and media management.

- **Envira Gallery**: Responsive image galleries
- **Modula**: Creative image and video galleries

### Optimization
Additional optimization tools.

- **Lazy Load by WP Anatomy**: Lazy load images
- **WP Super Minify**: Minify HTML, CSS, JavaScript
- **WP Statistics**: Analytics and visitor statistics

## ⚙️ Plugin Management Commands

### View Available Presets

```bash
# List all available plugin presets
python3 -m forge plugins presets

# List presets with detailed plugin information
python3 -m forge plugins presets --verbose
```

**Example Output:**
```
=== Available Plugin Presets ===

📦 Blog/Content Site (blog)
   Description: Essential plugins for blogging and content-focused websites
   Categories: essential, seo, performance, security
   Plugins: 8

📦 Business Website (business)
   Description: Complete plugin set for professional business websites
   Categories: essential, seo, performance, security, forms
   Plugins: 9
```

### Install Plugin Presets

```bash
# Install a preset to a project
python3 -m forge plugins install-preset business --project mysite

# Install with verbose output
python3 -m forge plugins install-preset ecommerce --project mystore --verbose

# Dry run to see what would be installed
python3 -m forge plugins install-preset blog --project myblog --dry-run
```

### Install Plugins by Category

```bash
# Install all performance plugins
python3 -m forge plugins install-category performance --project mysite

# Install security plugins
python3 -m forge plugins install-category security --project mysite --verbose
```

### Get Plugin Recommendations

```bash
# Get recommendations for a blog site
python3 -m forge plugins recommend --type=blog

# Get recommendations with additional categories
python3 -m forge plugins recommend --type=business --categories=performance,security

# Get recommendations and install to project
python3 -m forge plugins recommend --type=ecommerce --project mystore
```

### Check Plugin Status

```bash
# Check status of installed plugins
python3 -m forge plugins status --project mysite

# Check with verbose output and category filter
python3 -m forge plugins status --project mysite --category=seo --verbose
```

**Example Output:**
```
=== Plugin Status for 'mysite' ===

🟢 Active Plugins (7):
  • WordPress SEO (free) - seo
  • W3 Total Cache (free) - performance
  • Wordfence Security (freemium) - security
  • Contact Form 7 (free) - forms
  • Smush (freemium) - performance
  • Really Simple SSL (freemium) - security
  • Google Site Kit (free) - seo

📊 Plugin Summary:
  Total installed: 7
  Active: 7
  Inactive: 0

📂 By Category:
  performance: 2 plugins
  security: 2 plugins
  seo: 2 plugins
  forms: 1 plugin
```

### Update Plugins

```bash
# Update all plugins in a project
python3 -m forge plugins update --project mysite

# Update specific plugins
python3 -m forge plugins update --project mysite --plugins="wordpress-seo,wordfence"

# Dry run update
python3 -m forge plugins update --project mysite --dry-run
```

### Uninstall Plugins

```bash
# Uninstall specific plugins
python3 -m forge plugins uninstall "wordpress-seo,wordfence" --project mysite

# Dry run to preview
python3 -m forge plugins uninstall "akismet" --project mysite --dry-run
```

## 🎯 Plugin Selection Guide

### Choose the Right Preset

| Site Type | Recommended Preset | Why |
|-----------|-------------------|-----|
| **Personal Blog** | `blog` | Optimized for content creation and SEO |
| **Business Website** | `business` | Complete business toolkit with forms and SEO |
| **Online Store** | `ecommerce` | Full e-commerce stack with payment processing |
| **Portfolio** | `portfolio` | Image optimization and gallery support |
| **Development Site** | `minimal` | Essential plugins only for testing |
| **High-Traffic Site** | `performance` | Maximum speed optimization |

### Custom Plugin Selection

For specific requirements, combine presets and individual plugins:

```bash
# Start with business preset, add e-commerce plugins
python3 -m forge local create-project mysite --plugin-preset=business --plugins="woocommerce,stripe-gateway"

# Start with minimal, add specific plugins
python3 -m forge local create-project mysite --plugin-preset=minimal --plugins="wordpress-seo,contact-form-7,smush"
```

### Consider Site Requirements

1. **Content Type**: Blog, e-commerce, portfolio, business
2. **Traffic Expectations**: Low, medium, high traffic
3. **Technical Requirements**: Performance, security, SEO focus
4. **Budget**: Free plugins only vs. premium features
5. **Maintenance**: Automatic updates vs. manual control

## 🔗 Integration with Workflows

### Project Creation with Plugins

```bash
# Create project with specific plugin preset
python3 -m forge local create-project myblog \
  --plugin-preset=blog \
  --admin-user=admin \
  --admin-email=admin@example.com \
  --admin-password=securepass

# Create e-commerce site with additional plugins
python3 -m forge local create-project mystore \
  --plugin-preset=ecommerce \
  --plugins="pdf-invoices,woo-order-export" \
  --admin-user=admin
```

### Deployment with Plugin Verification

```bash
# Deploy and verify plugin status
python3 -m forge deploy mysite production
python3 -m forge plugins status --project mysite --env=production
```

### Backup Plugin Configuration

```bash
# Backup plugin settings
python3 -m forge sync backup mysite --include-plugins

# Restore with plugin configuration
python3 -m forge sync restore mysite backup_20231201 --include-plugins
```

## 💡 Best Practices

### Plugin Selection

1. **Start with Presets**: Use presets as baseline, customize as needed
2. **Avoid Bloat**: Don't install plugins you don't need
3. **Check Compatibility**: Verify plugins work with your WordPress version
4. **Consider Performance**: More plugins = slower site
5. **Security First**: Only use reputable, well-maintained plugins

### Plugin Management

1. **Regular Updates**: Keep plugins updated for security
2. **Test Updates**: Update staging before production
3. **Monitor Performance**: Check site speed after adding plugins
4. **Backup Before Changes**: Always backup before major plugin changes
5. **Review Regularly**: Remove unused plugins

### Performance Optimization

1. **Caching**: Always use caching plugins
2. **Image Optimization**: Use image compression plugins
3. **Lazy Loading**: Implement for media-heavy sites
4. **Minification**: Use CSS/JS optimization
5. **Database Optimization**: Clean up plugin data regularly

## 🔧 Troubleshooting

### Common Plugin Issues

#### Installation Failed
```bash
# Check plugin status
python3 -m forge plugins status --project mysite --verbose

# Try individual installation
python3 -m forge local create-project test --plugin-preset=minimal
python3 -m forge plugins install-category performance --project=test
```

#### Plugin Conflicts
```bash
# Check for conflicts before installation
python3 -m forge plugins install-preset custom --project mysite --dry-run

# Remove conflicting plugins
python3 -m forge plugins uninstall "competing-plugin" --project mysite
```

#### Performance Issues
```bash
# Check active plugins
python3 -m forge plugins status --project mysite

# Disable non-essential plugins
python3 -m forge plugins uninstall "heavy-plugin" --project mysite
```

### Error Messages

**"Plugin conflicts detected"**
- Review the conflict warnings
- Choose alternative plugins from different categories
- Use `--dry-run` to preview before installation

**"Installation failed for plugin X"**
- Check plugin compatibility with WordPress version
- Verify plugin is available in WordPress repository
- Try installing plugin individually

**"Site slow after plugin installation"**
- Use Query Monitor to identify slow plugins
- Consider alternatives for heavy plugins
- Optimize plugin settings

## 🚀 Advanced Usage

### Custom Plugin Configuration

Create custom plugin configurations in your project:

```json
{
  "project_plugins": {
    "preset": "business",
    "additional_plugins": ["custom-plugin"],
    "exclude_plugins": ["jetpack"],
    "plugin_settings": {
      "wordpress-seo": {
        "site_type": "company",
        "company_or_person": "company"
      },
      "w3-total-cache": {
        "pgcache_enabled": true,
        "minify_enabled": true
      }
    }
  }
}
```

### Environment-Specific Plugins

```bash
# Different plugins for different environments
# Development (minimal)
python3 -m forge local create-project mysite-dev --plugin-preset=minimal

# Staging (business)
python3 -m forge local create-project mysite-staging --plugin-preset=business

# Production (business + performance)
python3 -m forge local create-project mysite-prod --plugin-preset=business --plugins="autoptimize,query-monitor"
```

### Plugin Dependencies

The system automatically handles dependencies:

```bash
# WooCommerce automatically installs required plugins
python3 -m forge plugins install-preset ecommerce --project mystore
# Automatically installs: woocommerce, stripe-gateway (dependency)
```

### Batch Operations

```bash
# Install plugins to multiple projects
for project in site1 site2 site3; do
  python3 -m forge plugins install-preset business --project $project
done

# Update all projects
python3 -m forge local list-projects | while read project; do
  python3 -m forge plugins update --project $project
done
```

## 📚 Additional Resources

- [WordPress Plugin Repository](https://wordpress.org/plugins/)
- [Plugin Development Guide](PLUGIN_DEVELOPMENT.md)
- [Performance Optimization Guide](PERFORMANCE_OPTIMIZATION.md)
- [Security Best Practices](SECURITY_GUIDE.md)
- [Troubleshooting Guide](TROUBLESHOOTING.md)

## 🔍 Next Steps

1. **Choose Your Preset**: Select the appropriate preset for your site type
2. **Test Local**: Create a local project to test plugin combinations
3. **Customize**: Add or remove plugins based on specific needs
4. **Monitor**: Check performance and functionality
5. **Optimize**: Refine plugin selection over time

The plugin system is designed to get you started quickly while providing the flexibility to customize your WordPress site exactly as needed.