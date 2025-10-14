# Complete Blog Site Tutorial

Step-by-step guide to creating a professional blog website using Bedrock Forge with the blog plugin preset. This tutorial covers everything from initial setup to deployment.

## 📋 Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Step 1: Project Setup](#step-1-project-setup)
- [Step 2: Local Development](#step-2-local-development)
- [Step 3: Content Creation](#step-3-content-creation)
- [Step 4: Theme Customization](#step-4-theme-customization)
- [Step 5: SEO Optimization](#step-5-seo-optimization)
- [Step 6: Performance Tuning](#step-6-performance-tuning)
- [Step 7: Security Setup](#step-7-security-setup)
- [Step 8: Backup Configuration](#step-8-backup-configuration)
- [Step 9: Staging Environment](#step-9-staging-environment)
- [Step 10: Production Deployment](#step-10-production-deployment)
- [Step 11: Ongoing Maintenance](#step-11-ongoing-maintenance)
- [Troubleshooting](#troubleshooting)

## 🎯 Overview

This tutorial creates a professional blog website with:
- **Blog Plugin Preset**: Optimized plugins for content sites
- **SEO Ready**: Built-in search optimization
- **Performance Optimized**: Caching and image optimization
- **Secure**: Protection against spam and security threats
- **Analytics Ready**: Visitor tracking and statistics
- **Mobile Responsive**: Works on all devices

## 🚀 Prerequisites

### Required Software
- **Python 3.9+**
- **DDEV** (for local development)
- **Git** (for version control)
- **VS Code** (recommended editor)

### Optional but Recommended
- **Docker Desktop** (required by DDEV)
- **Google Account** (for Google Site Kit analytics)
- **GitHub Account** (for code hosting)

## 📁 Step 1: Project Setup

### 1.1 Create the Blog Project

```bash
# Create a new blog project with the blog plugin preset
python3 -m forge local create-project myblog \
  --plugin-preset=blog \
  --admin-user=admin \
  --admin-email=admin@myblog.com \
  --admin-password=SecureBlogPass123! \
  --site-title="My Professional Blog"
```

**Expected Output:**
```
Creating Bedrock project: myblog
Project directory: ~/Work/Wordpress/myblog
Setting up DDEV configuration...
Initializing WordPress...
Installing blog plugin preset...
Installing plugin preset 'Blog/Content Site' with 8 plugins
✅ Successfully installed: jetpack
✅ Successfully installed: wordpress-seo
✅ Successfully installed: w3-total-cache
✅ Successfully installed: wordfence
✅ Successfully installed: akismet
✅ Successfully installed: google-site-kit
✅ Successfully installed: wp-statistics
✅ Successfully installed: duplicate-post
✅ Successfully installed: manage-wp
Plugin installation complete: 8/8 plugins installed successfully

🚀 Project created successfully!
📁 Project directory: ~/Work/Wordpress/myblog
🌐 Local URL: https://myblog.ddev.site
👤 Admin URL: https://myblog.ddev.site/wp/wp-admin
👤 Username: admin
🔑 Password: SecureBlogPass123!

💡 Next steps:
  cd ~/Work/Wordpress/myblog
  ddev start
  ddev exec wp post create --post_title="Welcome to My Blog" --post_content="This is my first blog post..."
```

### 1.2 Navigate and Start Development

```bash
# Navigate to project directory
cd ~/Work/Wordpress/myblog

# Start DDEV
ddev start
```

**Expected Output:**
```
Starting myblog...
Network ddev_default created
Container ddev-ssh-agent created
Container ddev-db created
Container ddev-web created
Container ddev-router created
Successfully started myblog
Project can be reached at https://myblog.ddev.site
```

### 1.3 Verify Installation

```bash
# Check WordPress installation
ddev wp core version

# Check plugin status
ddev wp plugin list --status=active
```

**Expected Output:**
```
WordPress 6.4.2
+------------------------+--------+-----------+---------+
| name                   | status | update    | version |
+------------------------+--------+-----------+---------+
| akismet                | active | none      | 5.3     |
| duplicate-post          | active | none      | 3.2.1   |
| google-site-kit        | active | none      | 1.114.0 |
| jetpack                 | active | none      | 13.3    |
| manage-wp              | active | none      | 1.0.0   |
| wp-statistics          | active | none      | 14.1   |
| wordpress-seo           | active | none      | 22.1    |
| w3-total-cache         | active | none      | 2.3.4   |
| wordfence              | active | none      | 7.10.2  |
+------------------------+--------+-----------+---------+
```

## 🏠 Step 2: Local Development

### 2.1 Access Your Blog

Open your browser and navigate to:
- **Blog**: https://myblog.ddev.site
- **Admin Dashboard**: https://myblog.ddev.site/wp/wp-admin

### 2.2 Complete WordPress Setup

1. **Login** with your admin credentials
2. **Site Settings**: Go to Settings → General
   - **Site Title**: My Professional Blog
   - **Tagline**: Sharing thoughts and ideas
   - **Email Address**: admin@myblog.com
   - **Timezone**: Set your local timezone
   - **Date/Time Format**: Choose your preferred format

3. **Permalinks**: Go to Settings → Permalinks
   - Select **Post name** (/%postname%/)
   - Click **Save Changes**

### 2.3 Create Initial Content

```bash
# Create sample blog posts via WP-CLI
ddev wp post create \
  --post_title="Welcome to My Blog" \
  --post_content="Welcome to my professional blog! This is where I'll be sharing my thoughts, insights, and experiences. I'm excited to have you here and can't wait to start this journey with you. Stay tuned for some amazing content coming soon!" \
  --post_status=publish \
  --post_author=1

ddev wp post create \
  --post_title="About Me" \
  --post_content="Hi there! I'm a passionate writer and blogger. This blog is my digital home where I share everything I'm passionate about - from technology and business to lifestyle and personal development. I believe in the power of storytelling and meaningful conversations. When I'm not writing, you can find me exploring new places, reading books, or spending time with my family and friends. Thanks for stopping by, and I hope you'll join me on this amazing journey!" \
  --post_status=publish \
  --post_author=1

# Create sample categories
ddev wp term create category "Technology" --description="Posts about technology, software, and digital tools"
ddev wp term create category "Lifestyle" --description="Posts about lifestyle, personal development, and daily life"
ddev wp term create category "Business" --description="Posts about business, entrepreneurship, and professional growth"

# Create sample tags
ddev wp term create post_tag "blogging"
ddev wp term create post_tag "WordPress"
ddev wp term create post_tag "personal-growth"
ddev wp term create post_tag "technology"
```

## 🎨 Step 3: Theme Customization

### 3.1 Choose and Install a Theme

```bash
# Install a clean, fast theme
ddev wp theme install twentytwentyfour --activate

# Alternative: Install a popular blog theme
ddev wp theme install astra --activate
```

### 3.2 Customize Theme Appearance

1. **Customize Theme**: Go to Appearance → Customize
2. **Site Identity**:
   - Upload a logo
   - Set site icon (favicon)
   - Customize colors and typography

3. **Header**:
   - Configure navigation menu
   - Add social media links

4. **Footer**:
   - Add copyright notice
   - Add footer widgets

### 3.3 Create Navigation Menu

```bash
# Create primary navigation menu
ddev wp menu create "Primary Menu" --location=primary

# Add menu items
ddev wp menu item add-post primary-menu 1 --title="Home"
ddev wp menu item add-post primary-menu 2 --title="About Me"
ddev wp menu item add-post primary-menu 3 --title="Welcome"
```

## 🔍 Step 4: SEO Optimization

### 4.1 Configure WordPress SEO

1. **SEO Configuration**: Go to SEO → Search Appearance
   - **Knowledge Graph**: Select "Person" or "Organization"
   - **Homepage Title**: Set your blog name and tagline
   - **Site Representation**: Upload logo

2. **Search Console**: Go to SEO → General → Webmaster Tools
   - Connect Google Search Console
   - Verify ownership

### 4.2 Configure Google Site Kit

1. **Set up Site Kit**: Go to Site Kit → Connect Service
2. **Connect Google Services**:
   - Google Analytics
   - Google Search Console
   - Google AdSense (optional)

### 4.3 Set Up Categories and Tags

```bash
# Assign categories to sample posts
ddev wp term set category 1 1 --by=name  # Technology category for Welcome post
ddev wp term set category 2 2 --by=name  # Lifestyle category for About post

# Add tags to sample posts
ddev wp term set post_tag 1 1,2 --by=name  # blogging, WordPress tags for Welcome post
ddev wp term set post_tag 2 3,4 --by=name  # personal-growth, technology tags for About post
```

## ⚡ Step 5: Performance Tuning

### 5.1 Configure W3 Total Cache

1. **Page Cache**: Go to Performance → Page Cache
   - Enable Page Cache
   - Cache Preload: 10 pages
   - Automatic Cache Purge: Enabled

2. **Minify**: Go to Performance → Minify
   - HTML Minify: Enabled
   - JS Minify: Enabled
   - CSS Minify: Enabled

3. **Browser Cache**: Go to Performance → Browser Cache
   - Set Expires Headers: 1 year
   - Cache Control: Public

### 5.2 Configure Image Optimization

```bash
# Configure Smush settings
ddev wp option update smush_auto_compress 1
ddev wp option update smush_auto_resize 1
ddev wp option update smush_webp 1

# Run initial image optimization
ddev wp smush optimize-all
```

### 5.3 Test Performance

```bash
# Check site load time
curl -w "%{time_total}\n" -o /dev/null -s https://myblog.ddev.site

# Alternative: Use DDEV performance check
ddev describe -j | jq -r '.performance'
```

## 🔒 Step 6: Security Setup

### 6.1 Configure Wordfence

1. **Security Scan**: Go to Wordfence → Scan
   - Run Wordfence Scan
   - Review any issues found

2. **Firewall Settings**: Go to Wordfence → Firewall
   - Enable Firewall Protection
   - Set Learning Mode (initially)

3. **Login Protection**: Go to Wordfence → Login Security
   - Enable 2FA for admin account
   - Set strong password requirements

### 6.2 Configure Akismet

1. **Get API Key**: Go to Akismet Configuration
   - Get free personal API key
   - Activate anti-spam protection

### 6.3 Security Best Practices

```bash
# Hide WordPress version
ddev wp option update blog_public 1

# Disable XML-RPC
ddev wp option update enable_xmlrpc 0

# Set secure file permissions
ddev exec chmod 644 wp-config.php
ddev exec chmod 755 wp-content/
```

## 📊 Step 7: Analytics Setup

### 7.1 Configure WP Statistics

1. **Statistics Settings**: Go to Statistics → Settings
   - Enable collection of user statistics
   - Choose what to track
   - Set privacy settings

### 7.2 Configure Jetpack

1. **Jetpack Connection**: Go to Jetpack Dashboard
   - Connect to WordPress.com account
   - Enable site stats

### 7.3 Install Analytics

```bash
# Install additional analytics plugin if needed
ddev wp plugin install google-analytics-for-wordpress --activate
```

## 💾 Step 8: Backup Configuration

### 8.1 Configure Local Backups

```bash
# Create backup directory
mkdir -p ~/Work/Wordpress/myblog/.forge/backups

# Set up scheduled backups
ddev exec crontab -l | grep -q backup || ddev exec echo "0 2 * * * /usr/local/bin/wp db export ~/Work/Wordpress/myblog/.forge/backups/db_$(date +\%Y\%m\%d).sql" | ddev exec crontab -
```

### 8.2 Configure Remote Backups

```bash
# Configure Google Drive integration (if available)
python3 -m forge sync configure --provider=google_drive --project=myblog

# Create first backup
python3 -m forge sync backup mysite --include-plugins --include-config
```

## 🚧 Step 9: Staging Environment

### 9.1 Create Staging Site

```bash
# Create staging copy
python3 -m forge local create-project myblog-staging \
  --plugin-preset=minimal \
  --admin-user=admin \
  --admin-email=admin@myblog.com
```

### 9.2 Sync Content to Staging

```bash
# Export content from production
ddev wp export --dir=.forge/exports --post_type=all

# Import to staging
cd ../myblog-staging
ddev wp import .forge/exports/wordpress.xml --authors=create
```

## 🌐 Step 10: Production Deployment

### 10.1 Prepare for Deployment

```bash
# Clean up development data
ddev wp cache flush
ddev wp transient delete --all

# Optimize database
ddev wp db optimize

# Create deployment backup
python3 -m forge sync backup myblog --pre-deployment
```

### 10.2 Choose Hosting Provider

```bash
# Option 1: Deploy to shared hosting
python3 -m forge deploy myblog production --method=ftp

# Option 2: Deploy to VPS
python3 -m forge deploy myblog production --method=ssh

# Option 3: Deploy with Git
python3 -m forge deploy myblog production --method=git
```

### 10.3 Production Configuration

```bash
# Set production environment variables
python3 -m forge config set --project=myblog env=production
python3 -m forge config set --project=myblog debug_mode=false
python3 -m forge config set --project=myblog cache_enabled=true
```

## 🔄 Step 11: Ongoing Maintenance

### 11.1 Regular Updates

```bash
# Update WordPress core
ddev wp core update

# Update plugins
ddev wp plugin update --all

# Update themes
ddev wp theme update --all

# Run security scan
ddev wf scan
```

### 11.2 Performance Monitoring

```bash
# Check plugin performance
python3 -m forge plugins status --project=myblog --verbose

# Monitor site uptime
python3 -m forge monitor check myblog
```

### 11.3 Content Management Workflow

```bash
# Create weekly content
ddev wp post create --post_title="Weekly Roundup" --post_content="Content..."

# Optimize images
ddev wp smush optimize-all

# Update sitemap
ddev wp seo generate-sitemap
```

## 🛠 Troubleshooting

### Common Issues and Solutions

#### Plugin Conflicts
```bash
# Check plugin conflicts
python3 -m forge plugins install-preset custom --project=myblog --dry-run

# Deactivate conflicting plugins
ddev wp plugin deactivate conflicting-plugin
```

#### Performance Issues
```bash
# Check slow plugins
ddev wp query monitor

# Clear all caches
ddev wp cache flush all
```

#### Database Issues
```bash
# Repair database
ddev wp db repair

# Optimize database
ddev wp db optimize
```

#### Import Errors
```bash
# Increase memory limit
ddev wp option update max_upload_size 52428800

# Extend execution time
ddev wp option update max_execution_time 300
```

### Getting Help

```bash
# Check system status
python3 -m forge info --project=myblog

# Get detailed logs
ddev logs

# Reset local environment
ddev reset
```

## ✅ Next Steps

Congratulations! Your professional blog is now live and optimized. Here's what to do next:

1. **Start Creating Content**: Begin writing and publishing blog posts
2. **Engage with Readers**: Respond to comments and build community
3. **Monitor Analytics**: Track visitor statistics and optimize content
4. **Regular Maintenance**: Keep plugins and WordPress updated
5. **Backup Regularly**: Maintain regular backup schedule
6. **Promote Your Blog**: Share content on social media and other platforms

## 📚 Additional Resources

- [Plugin System Guide](../PLUGIN_SYSTEM.md)
- [Configuration Guide](../CONFIGURATION.md)
- [Performance Optimization Guide](../PERFORMANCE_OPTIMIZATION.md)
- [Security Best Practices](../SECURITY_GUIDE.md)
- [Troubleshooting Guide](../TROUBLESHOOTING.md)

## 🎉 Success Checklist

- [ ] Blog created with blog plugin preset
- [ ] WordPress configured and optimized
- [ ] SEO settings configured
- [ ] Performance optimizations applied
- [ ] Security measures implemented
- [ ] Analytics and tracking set up
- [ ] Backup strategy in place
- [ ] Staging environment created
- [ ] Production deployment successful
- [ ] Maintenance workflow established

Your professional blog is now ready for publishing and sharing with the world! 🎉