# Complete Business Website Tutorial

Step-by-step guide to creating a professional business website using Bedrock Forge with the business plugin preset. This tutorial covers everything from initial setup to client management and lead generation.

## 📋 Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Step 1: Business Project Setup](#step-1-business-project-setup)
- [Step 2: Professional Branding](#step-2-professional-branding)
- [Step 3: Content Structure](#step-3-content-structure)
- [Step 4: Contact and Lead Generation](#step-4-contact-and-lead-generation)
- [Step 5: Services and Portfolio](#step-5-services-and-portfolio)
- [Step 6: Team Information](#step-6-team-information)
- [Step 7: SEO Optimization](#step-7-seo-optimization)
- [Step 8: Analytics and Tracking](#step-8-analytics-and-tracking)
- [Step 9: Security Setup](#step-9-security-setup)
- [Step 10: Performance Optimization](#step-10-performance-optimization)
- [Step 11: Client Management](#step-11-client-management)
- [Step 12: Integration with Business Tools](#step-12-integration-with-business-tools)
- [Step 13: Multi-language Setup](#step-13-multi-language-setup)
- [Step 14: Testing and Quality Assurance](#step-14-testing-and-quality-assurance)
- [Step 15: Production Deployment](#step-15-production-deployment)
- [Step 16: Ongoing Site Management](#step-16-ongoing-site-management)
- [Troubleshooting](#troubleshooting)

## 🎯 Overview

This tutorial creates a professional business website with:
- **Business Plugin Preset**: Complete business toolkit with forms, SEO, and performance
- **Lead Generation**: Contact forms, quote requests, and client acquisition
- **Professional Branding**: Custom design with logo, colors, and typography
- **Content Management**: Easy-to-update pages and content
- **Analytics Ready**: Visitor tracking and conversion optimization
- **Security**: Professional-grade security and protection
- **Mobile Responsive**: Works perfectly on all devices

## 🚀 Prerequisites

### Required Software
- **Python 3.9+**
- **DDEV** (for local development)
- **Git** (for version control)
- **VS Code** (recommended editor)

### Required Accounts
- **Google Account** (for analytics and site kit)
- **Email Service Account** (Mailchimp, SendGrid, or similar)
- **GitHub Account** (for code hosting)

### Business Requirements
- **Domain Name**: Professional domain for your business
- **Business Email**: Professional email address
- **Logo and Brand Assets**: Company logo and brand guidelines
- **Content**: Company information, services, and team details

## 📁 Step 1: Business Project Setup

### 1.1 Create the Business Project

```bash
# Create a new business project with the business plugin preset
python3 -m forge local create-project mybusiness \
  --plugin-preset=business \
  --admin-user=admin \
  --admin-email=admin@mybusiness.com \
  --admin-password=SecureBizPass123! \
  --site-title="My Business - Professional Services"
```

**Expected Output:**
```
Creating Bedrock project: mybusiness
Project directory: ~/Work/Wordpress/mybusiness
Setting up DDEV configuration...
Initializing WordPress...
Installing business plugin preset...
Installing plugin preset 'Business Website' with 9 plugins
✅ Successfully installed: wordpress-seo
✅ Successfully installed: w3-total-cache
✅ Successfully installed: wordfence
✅ Successfully installed: contact-form-7
✅ Successfully installed: google-site-kit
✅ Successfully installed: smush
✅ Successfully installed: redirection
✅ Successfully installed: duplicate-page
✅ Successfully installed: really-simple-ssl
✅ Successfully installed: manage-wp
Plugin installation complete: 9/9 plugins installed successfully

🚀 Project created successfully!
📁 Project directory: ~/Work/Wordpress/mybusiness
🌐 Local URL: https://mybusiness.ddev.site
👤 Admin URL: https://mybusiness.ddev.site/wp/wp-admin
👤 Username: admin
🔑 Password: SecureBizPass123!

💡 Next steps:
  cd ~/Work/Wordpress/mybusiness
  ddev start
  Complete site configuration
  Set up branding and content
```

### 1.2 Navigate and Start Development

```bash
# Navigate to project directory
cd ~/Work/Wordpress/mybusiness

# Start DDEV
ddev start
```

**Expected Output:**
```
Starting mybusiness...
Network ddev_default created
Container ddev-ssh-agent created
Container ddev-db created
Container ddev-web created
Container ddev-router created
Successfully started mybusiness
Project can be reached at https://mybusiness.ddev.site
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
| contact-form-7          | active | none      | 5.8     |
| duplicate-page          | active | none      | 3.2.1   |
| google-site-kit        | active | none      | 1.114.0  |
| manage-wp              | active | none      | 1.0.0    |
| redirection             | active | none      | 5.3.6   |
| really-simple-ssl      | active | none      | 7.1.1    |
| smush                  | active | none      | 3.12.3  |
| wordpress-seo           | active | none      | 22.1     |
| w3-total-cache         | active | none      | 2.3.4    |
| wordfence              | active | none      | 7.10.2   |
+------------------------+--------+-----------+---------+
```

## 🏢 Step 2: Professional Branding

### 2.1 Access Your Website

Open your browser and navigate to:
- **Website**: https://mybusiness.ddev.site
- **Admin Dashboard**: https://mybusiness.ddev.site/wp/wp-admin

### 2.2 Complete WordPress Setup

1. **Login** with your admin credentials
2. **Site Settings**: Go to Settings → General
   - **Site Title**: My Business - Professional Services
   - **Tagline**: Professional services and solutions for your success
   - **Email Address**: contact@mybusiness.com
   - **Timezone**: Set your local timezone
   - **Date/Time Format**: Choose your preferred format

### 2.3 Configure Permalinks

```bash
# Set up SEO-friendly permalinks
ddev wp rewrite structure '/%postname%/'
ddev wp rewrite flush
```

### 2.4 Set Up SSL and HTTPS

```bash
# Verify SSL is active
ddev wp option update siteurl "https://mybusiness.ddev.site"
ddev wp option update home "https://mybusiness.ddev.site"

# Force HTTPS
ddev wp option update wpssl_ssl_redirect "yes"
```

## 🏗️ Step 3: Content Structure

### 3.1 Create Main Pages

```bash
# Create Home page
ddev wp post create \
  --post_title="Home" \
  --post_content="Welcome to My Business! We provide professional services and solutions to help your company succeed. Our team of experts is dedicated to delivering exceptional results and exceeding your expectations." \
  --post_status=publish

# Create About Us page
ddev wp post create \
  --post_title="About Us" \
  --post_content="Learn more about our company's history, mission, and values. We are a team of passionate professionals committed to excellence and innovation in everything we do." \
  --post_status=publish

# Create Services page
ddev wp post create \
  --post_title="Services" \
  --post_content="Discover our comprehensive range of professional services designed to meet your business needs. From consulting to implementation, we provide end-to-end solutions tailored to your requirements." \
  --post_status=publish

# Create Contact page
ddev wp post create \
  --post_title="Contact" \
  --post_content="Get in touch with our team to discuss how we can help your business grow. We're here to answer your questions and provide expert guidance on your projects." \
  --post_status=publish

# Create Portfolio page
ddev wp post create \
  --post_title="Portfolio" \
  --post_content="Explore our portfolio of successful projects and see how we've helped businesses like yours achieve their goals. Each case study demonstrates our commitment to quality and innovation." \
  --post_status=publish

# Create Team page
ddev wp post create \
  --post_title="Our Team" \
  --post_content="Meet the talented professionals behind our success. Our diverse team brings together expertise from various fields to deliver comprehensive solutions for our clients." \
  --post_status=publish
```

### 3.2 Create Service Categories

```bash
# Create service categories
ddev wp term create category "Consulting" --description="Professional consulting services"
ddev wp term create category "Development" --description="Custom development solutions"
ddev wp term create category "Marketing" --description="Digital marketing strategies"
ddev wp term create category "Support" --description="Ongoing support and maintenance"

# Create tags
ddev wp term create post_tag "professional"
ddev wp term create post_tag "business"
ddev wp term create post_tag "solutions"
ddev wp term create post_tag "expertise"
```

### 3.3 Set Up Navigation Menu

```bash
# Create primary navigation menu
ddev wp menu create "Main Menu" --location=primary

# Add menu items
ddev wp menu item add-post main-menu 1 --title="Home"
ddev wp menu item add-post main-menu 2 --title="About Us"
ddev wp menu item add-post main-menu 3 --title="Services"
ddev wp menu item add-post main-menu 4 --title="Portfolio"
ddev wp menu item add-post main-menu 5 --title="Team"
ddev wp menu item add-post main-menu 6 --title="Contact"

# Create footer menu
ddev wp menu create "Footer Menu" --location=footer
ddev wp menu item add-post footer-menu 1 --title="Privacy Policy"
ddev wp menu item add-post footer-menu 2 --title="Terms of Service"
ddev wp menu item add-post footer-menu 3 --title="Sitemap"
```

## 📧 Step 4: Contact and Lead Generation

### 4.1 Configure Contact Forms

```bash
# Create contact form shortcode
cat > contact-form-shortcode.md << 'EOF'
[contact-form-7 id="1" title="Get in Touch"]
<div class="form-group">
    [text* your-name class:form-control placeholder "Your Name" ]
</div>
<div class="form-group">
    [email* your-email class:form-control placeholder "Your Email" ]
</div>
<div class="form-group">
    [text* your-subject class:form-control placeholder="Subject" ]
</div>
<div class="form-group">
    [textarea your-message class:form-control placeholder "Your Message" x4]
</div>
<div class="form-group">
    [submit "Send Message" class:btn btn-primary]
</div>
[response-to-message class="response-message"]
EOF

# Create quote request form
cat > quote-form-shortcode.md << 'EOF'
[contact-form-7 id="2" title="Request a Quote"]
<div class="form-group">
    [text* company-name class:form-control placeholder "Company Name" ]
</div>
<div class="form-group">
    [text* contact-person class:form-control placeholder="Contact Person" ]
</div>
<div class="form-group">
    [email* business-email class:form-control placeholder="Business Email" ]
</div>
<div class="form-group">
    [tel* phone class:form-control placeholder="Phone Number" ]
</div>
<div class="form-group">
    [select* service-interest class:form-control "Consulting" "Development" "Marketing" "Support" "Other"]
</div>
<div class="form-group">
    [number* budget class:form-control placeholder="Budget Range" min="1000" max="100000"]
</div>
<div class="form-group">
    [textarea project-details class:form-control placeholder="Project Details" x4]
</div>
<div class="form-group">
    [submit "Request Quote" class:btn btn-success]
</div>
[response-to-message class="response-message"]
EOF
```

### 4.2 Add Contact Forms to Pages

```bash
# Add contact form to Contact page
ddev wp post update 6 --post_content="<p>We'd love to hear from you! Fill out the form below or reach out directly using the contact information.</p>\n[contact-form-7 id=\"1\" title=\"Get in Touch\"]\n\n<strong>Alternative Contact Methods:</strong>\n<ul>\n<li>Email: contact@mybusiness.com</li>\n<li>Phone: (555) 123-4567</li>\n<li>Address: 123 Business Ave, Suite 100</li>\n</ul>"

# Add quote form to Services page
ddev wp post update 3 --post_content="<p>Ready to discuss how we can help your business? Request a personalized quote tailored to your specific needs.</p>\n[contact-form-7 id=\"2\" title=\"Request a Quote\"]\n\n<strong>Why Choose Us?</strong>\n<ul>\n<li>Expert consultation and analysis</li>\n<li>Customized solutions</li>\n<li>Competitive pricing</li>\n<li>Ongoing support</li>\n<li>Proven track record</li>\n</ul>"
```

### 4.3 Configure Email Notifications

```bash
# Configure email settings
ddev wp option update wp_mail_smtp_enabled "yes"
ddev wp option update wp_mail_smtp_from "contact@mybusiness.com"
ddev wp option update wp_mail_smtp_from_name "My Business"
ddev wp option update wp_mail_smtp_host "smtp.gmail.com"
ddev wp option update wp_mail_smtp_port "587"
ddev wp option update wp_mail_smtp_auth "true"
ddev wp option update wp_mail_smtp_username "contact@mybusiness.com"
ddev wp option update wp_mail_smtp_password "your_app_password"
```

## 🎨 Step 5: Services and Portfolio

### 5.1 Create Service Pages

```bash
# Create specific service pages
ddev wp post create \
  --post_title="Business Consulting" \
  --post_content="Our expert business consulting services help organizations optimize operations, improve efficiency, and achieve their strategic goals. We work closely with your team to identify opportunities and implement practical solutions." \
  --post_status=publish

ddev wp post create \
  --post_title="Web Development" \
  --post_content="Custom web development services including responsive design, e-commerce solutions, and web applications. We build websites that not only look great but also deliver measurable results for your business." \
  --post_status=publish

ddev post create \
  --post_title="Digital Marketing" \
  --post_content="Comprehensive digital marketing strategies to increase your online visibility, attract more customers, and grow your business. We handle SEO, social media, content marketing, and paid advertising." \
  --post_status=publish

# Assign categories
ddev wp term set category 7 1 --by=name  # Business Consulting to Consulting
ddev wp term set category 8 2 --by=name  # Web Development to Development
ddev wp term set category 9 3 --by=name  # Digital Marketing to Marketing
```

### 5.2 Create Portfolio Items

```bash
# Create portfolio items as pages
ddev wp post create \
  --post_title="Client Success Story - Tech Startup" \
  --post_content="How we helped a technology startup launch their platform and achieve 500% growth in the first year. Learn about the challenges we faced and the solutions we implemented." \
  --post_status=publish

ddev wp post create \
  --post_title="E-commerce Solution for Retail Business" \
  --post_content="Complete e-commerce platform development for a growing retail business, including inventory management, payment processing, and customer experience optimization." \
  --post_status=publish

# Create portfolio category
ddev wp term create category "Portfolio" --description="Our successful projects and case studies"

# Assign to portfolio category
ddev wp term set category 10 4 --by=name
ddev wp term set category 11 4 --by=name
```

### 5.3 Create Testimonials

```bash
# Create testimonials as a custom post type (if plugin available)
ddev wp post create \
  --post_title="Great Experience Working with My Business" \
  --post_content="The team at My Business exceeded our expectations with their professionalism and expertise. They delivered our project on time and within budget. Highly recommended!" \
  --post_status=publish

# Create client information
ddev wp post update 12 --meta_input=_client_name="John Doe" --meta_input=_client_company="ABC Tech" --meta_input=_client_position="CEO"
```

## 👥 Step 6: Team Information

### 6.1 Create Team Member Profiles

```bash
# Create team member pages
ddev wp post create \
  --post_title="John Smith - CEO & Founder" \
  --post_content="John founded My Business with over 15 years of experience in the industry. His vision and leadership have been instrumental in building our reputation for excellence and customer satisfaction." \
  --post_status=publish

ddev wp post create \
  --post_title="Jane Doe - Lead Developer" \
  --post_content="Jane brings over 10 years of development experience to our team. Her technical expertise and problem-solving skills ensure that every project is delivered to the highest standards." \
  --post_status=publish

ddev wp post create \
  --post_title="Mike Johnson - Marketing Director" \
  --post_content="Mike oversees our marketing strategies and helps clients achieve their business goals through innovative digital marketing solutions. His data-driven approach ensures measurable results." \
  --post_status=publish
```

### 6.2 Create Team Categories

```bash
# Create team categories
ddev wp term create category "Leadership" --description="Company leadership and management"
ddev wp term create category "Development" --description="Technical team members"
ddev wp term create category "Marketing" --description="Marketing and sales professionals"
ddev wp term create category "Support" --description="Customer support and service team"

# Assign categories
ddev wp term set category 13 1 --by=name  # John Smith to Leadership
ddev wp term set category 14 2 --by=name  # Jane Doe to Development
ddev wp term set category 15 3 --by=name  # Mike Johnson to Marketing
```

## 🔍 Step 7: SEO Optimization

### 7.1 Configure WordPress SEO

```bash
# Configure basic SEO settings
ddev wp option update wpseo_titles "a:1:{s:5:\"title\";s:0:\"\";}"
ddev wp option update wpseo_xml "a:1:{s:15:\"enable_xmlsitemap\";s:1:\"1\";}"
ddev wp option update wpseo_social "a:1:{s:13:\"og_default_image\";s:0:\"\";}"
```

### 7.2 Configure Google Search Console

```bash
# Connect Google Search Console
ddev wp option update wpseo_google_search_console "connected"
ddev wp option update wpseo_google_search_console_verification "connected"
```

### 7.3 Set Up Redirects

```bash
# Create common redirects
ddev redirection create --from="/old-page" --to="/new-page" --match="url"
ddev redirection create --from="/contact-us" --to="/contact" --match="url"
ddev redirection create --from="/services/web-development" --to="/web-development" --match="url"
```

### 7.4 Configure Meta Data

```bash
# Set up meta descriptions for pages
ddev wp post update 1 --meta_input=_yoast_wpseo_title="Professional Business Services | My Business"
ddev wp post update 1 --meta_input=_yoast_wpseo_metadesc="Professional business services and solutions to help your company succeed. Expert consulting, development, and marketing services."
ddev wp post update 1 --meta_input=_yoast_wpseo_focuskw="business services, professional consulting"
```

## 📊 Step 8: Analytics and Tracking

### 8.1 Configure Google Site Kit

```bash
# Connect Google Site Kit
ddev wp option update googlesitekit_site_setup_status "connected"
ddev wp option update googlesitekit_analytics_4_setup_complete "connected"
ddev option update googlesitekit_search_console_setup_complete "connected"
```

### 8.2 Set Up Contact Form Tracking

```bash
# Add form submission tracking
ddev post update 6 --post_content="[contact-form-7 id=\"1\" title=\"Get in Touch\"]\n\n[response-to-message]\n\n<script>\n// Track form submissions\ndocument.addEventListener('wpcf7submit', function(event) {\n    if (event.detail.contactFormId === '1') {\n        gtag('event', 'contact_form_submission', {\n            event_category: 'Contact',\n            event_label: 'Main Contact Form'\n        });\n    }\n});\n</script>"

# Add quote request tracking
ddev post update 3 --post_content="[contact-form-7 id=\"2\" title=\"Request a Quote\"]\n\n[response-to-message]\n\n<script>\n// Track quote requests\ndocument.addEventListener('wpcf7submit', function(event) {\n    if (event.detail.contactFormId === '2') {\n        gtag('event', 'quote_request', {\n            event_category: 'Lead Generation',\n            event_label: 'Quote Request Form'\n        });\n    }\n});\n</script>"
```

### 8.3 Configure WP Statistics

```bash
# Configure visitor tracking
ddev wp option update wp_statistics_option="a:1:{s:15:\"online_count\";s:1:\"1\";}"
ddev wp option update wp_statistics_menu "a:1:{s:9:\"show_hits\";s:1:\"1\";}"
ddev wp option update wp_statistics_pages "a:1:{s:12:\"show_pages\";s:1:\"1\";}"
```

## 🔒 Step 9: Security Setup

### 9.1 Configure Wordfence

```bash
# Set up Wordfence security
ddev wf scan
ddev wp option update wordfence_config "a:1:{s:12:\"firewall\";s:1:\"1\";}"
ddev wp option update wordfence_config "a:1:{s:13:\"scanEnabled\";s:1:\"1\";}"
ddev wp option update wordfence_config "a:1:{s:19:\"loginProtectionEnabled\";s:1:\"1\";}"
```

### 9.2 Configure SSL Certificate

```bash
# Verify SSL configuration
ddev wp option update rlrsssl_ssl_enabled "yes"
ddev wp option update rlrsssl_ssl_redirect "yes"
ddev wp option update rlrsssl_autoreplace_insecure_links "yes"
```

### 9.3 Set Up Regular Security Scans

```bash
# Schedule daily security scans
ddev exec echo "0 2 * * * ddev wf scan" | ddev exec crontab -
```

## ⚡ Step 10: Performance Optimization

### 10.1 Configure Caching

```bash
# Configure W3 Total Cache
ddev wp option update w3tc_pgcache_enabled "yes"
ddev wp option update w3tc_dbcache_enabled "yes"
ddev wp option update w3tc_objectcache_enabled "yes"
ddev wp option update w3tc_browsercache_enabled "yes"

# Configure cache settings
ddev wp option update w3tc_pgcache_reject_pages "/contact/,/quote-request/"
ddev wp option update w3tc_pgcache_reject_cookies "wordpress_logged_in_"
```

### 10.2 Optimize Images

```bash
# Configure Smush
ddev wp option update smush_auto_compress "yes"
ddev wp option update smush_webp "yes"
ddev wp option update smush_lazy_load "yes"

# Run initial image optimization
ddev wp smush optimize-all
```

### 10.3 Optimize Database

```bash
# Optimize database
ddev wp db optimize

# Configure automatic cleanup
ddev wp option update wp_schedule_cleanup "yes"
```

## 👨‍💼 Step 11: Client Management

### 11.1 Configure Customer Accounts

```bash
# Enable customer registration
ddev wp option update users_can_register "yes"
ddev wp option_update default_role "subscriber"
```

### 11.2 Create Client Portal

```bash
# Create client portal page
ddev wp post create \
  --post_title="Client Portal" \
  --post_content="Welcome to your client portal! Here you can access project updates, invoices, and communicate with our team. Please log in to access your personalized dashboard." \
  --post_status=publish
```

### 11.3 Configure Client Communication

```bash
# Create client communication channels
ddev wp post create \
  --post_title="Client Support" \
  --post_content="Need help? Our dedicated client support team is here to assist you. Contact us through our support ticket system, email, or phone during business hours." \
  --post_status=publish
```

## 🔧 Step 12: Integration with Business Tools

### 12.1 Configure CRM Integration

```bash
# Install CRM plugin
ddev wp plugin install wp-crm --activate

# Configure CRM settings
ddev wp option update wp_crm_enabled "yes"
ddev wp option update wp_crm_default_contact_source "website"
```

### 12.2 Set Up Project Management

```basy
# Install project management plugin
ddev wp plugin install updraftplus --activate

# Configure backup settings
ddev wp option update updraft_interval "daily"
ddev wp option update updraft_retention "14"
```

### 12.3 Configure Email Marketing

```bash
# Install email marketing plugin
ddev wp plugin install mailchimp-for-wp --activate

# Connect to Mailchimp
ddev wp option update mc4wp_api_key "your-mailchimp-api-key"
ddev wp option update mc4wp_list_id "your-list-id"
```

## 🌍 Step 13: Multi-language Setup

### 13.1 Install Language Plugin

```bash
# Install multilingual plugin
ddev wp plugin install wpml-multilingual-cms --activate

# Configure languages
ddev wp language plugin install es fr de --activate
```

### 13.2 Configure Translation

```bash
# Set up language switcher
ddev wp option update wpml_language_switcher_style "dropdown"
ddev wp option update wpml_flag_type "language_name"
```

## 🧪 Step 14: Testing and Quality Assurance

### 14.1 Test All Forms

```bash
# Test contact form submission
ddev wp post get 6 --format=body

# Test quote request form
ddev wp post get 3 --format=body

# Check form submissions in database
ddev wp db query "SELECT * FROM wp_posts WHERE post_type='wpcf7_contact_form'"
```

### 14.2 Test Performance

```bash
# Check page load times
curl -w "%{time_total}\n" -o /dev/null -s https://mybusiness.ddev.site/

# Test cache effectiveness
ddev wp cache test
```

### 14.3 Test Security

```bash
# Run security scan
ddev wf scan

# Check SSL certificate
ddev wp option get rlrsssl_ssl_active

# Test login security
ddev wp user list
```

## 🌐 Step 15: Production Deployment

### 15.1 Prepare for Production

```bash
# Clean up development data
ddev wp cache flush all
ddev wp transient delete --all

# Optimize database
ddev wp db optimize

# Create production backup
python3 -m forge sync backup mybusiness --pre-deployment
```

### 15.2 Deploy to Production

```bash
# Deploy to production server
python3 -m forge deploy mybusiness production \
  --method=ssh \
  --host=your-server.com \
  --user=sshuser \
  --path=/var/www/mybusiness

# Configure production environment
python3 -m forge config set --project=mybusiness env=production
python3 -m forge config set --project=mybusiness debug_mode=false
python3 -m forge config set --project=mybusiness cache_enabled=true
```

### 15.3 Configure Production Settings

```bash
# Update site URL
ddev wp option update siteurl "https://mybusiness.com"
ddev wp option update home "https://mybusiness.com"

# Configure production email
ddev wp option update admin_email "contact@mybusiness.com"

# Set up production SSL
ddev wp option update rlrsssl_ssl_enabled "yes"
ddev wp option update rlrsssl_ssl_redirect "yes"
```

## 🔄 Step 16: Ongoing Site Management

### 16.1 Daily Tasks

```bash
# Check for new leads
ddev wp post list --post_type=contact_form_7 --post_status=publish

# Monitor site performance
python3 -m forge monitor check mybusiness

# Check security status
ddev wf status
```

### 16.2 Weekly Tasks

```bash
# Update content
ddev post list --post_status=draft

# Update plugins
ddev plugin update --all

# Review analytics
ddev wp statistics get
```

### 16.3 Monthly Tasks

```bash
# Generate reports
ddev wp statistics get --from=$(date -d '1 month ago' +%Y-%m-%d) --to=$(date +%Y-%m-%d)

# Check SEO performance
ddev wp seo get_score

# Review security
ddev wf scan
```

## 🛠 Troubleshooting

### Common Business Website Issues

#### Contact Form Issues
```bash
# Check contact form configuration
ddev wp option get wpcf7
ddev wp post list --post_type=contact_form_7

# Check email delivery
ddev wp mail-test
```

#### Performance Issues
```bash
# Check slow loading pages
ddev query monitor

# Optimize database
ddev wp db optimize

# Clear caches
ddev wp cache flush all
```

#### Security Issues
```bash
# Check security scan results
ddev wf status

# Review security settings
ddev wp option get wordfence_config

# Check file permissions
ddev exec find . -type f -perm 777
```

### Getting Help

```bash
# Check system status
python3 -m forge info --project=mybusiness

# Get detailed logs
ddev logs

# Run health check
ddev wp health check
```

## ✅ Next Steps

Congratulations! Your professional business website is now live and ready for business. Here's what to do next:

1. **Add Real Content**: Replace sample content with your actual business information
2. **Set Up Email Marketing**: Configure your email marketing campaigns
3. **Launch Marketing Campaigns**: Start promoting your website and services
4. **Monitor Analytics**: Track visitor behavior and conversion rates
5. **Generate Leads**: Follow up on contact form submissions and quote requests
6. **Regular Maintenance**: Keep content updated and security patches applied

## 📚 Additional Resources

- [Plugin System Guide](../PLUGIN_SYSTEM.md)
- [Configuration Guide](../CONFIGURATION.md)
- [Security Best Practices](../SECURITY_GUIDE.md)
- [Performance Optimization Guide](../PERFORMANCE_OPTIMIZATION.md)
- [Troubleshooting Guide](../TROUBLESHOOTING.md)

## 🎉 Success Checklist

- [ ] Business project created with business plugin preset
- [ ] Professional branding implemented
- [] Content structure created
- [] Contact and lead generation forms configured
- [] Services and portfolio pages created
- [] Team information added
- [ ] SEO optimization implemented
- [] Analytics and tracking set up
- [ ] Security measures implemented
- [ ] Performance optimized
- [ ] Client management configured
- [ ] Business tools integrated
- [ ] Testing and QA completed
- [ ] Production deployment successful
- [ ] Ongoing management workflow established

Your professional business website is now ready to help you attract clients and grow your business! 🎉