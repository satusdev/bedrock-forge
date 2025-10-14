# Complete E-commerce Site Tutorial

Comprehensive step-by-step guide to creating a professional e-commerce store using Bedrock Forge with WooCommerce and the ecommerce plugin preset. This tutorial covers everything from initial setup to payment processing and order management.

## 📋 Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Step 1: E-commerce Project Setup](#step-1-ecommerce-project-setup)
- [Step 2: WooCommerce Configuration](#step-2-woocommerce-configuration)
- [Step 3: Payment Gateway Setup](#step-3-payment-gateway-setup)
- [Step 4: Product Management](#step-4-product-management)
- [Step 5: Store Design](#step-5-store-design)
- [Step 6: Tax Configuration](#step-6-tax-configuration)
- [Step 7: Shipping Setup](#step-7-shipping-setup)
- [Step 8: Order Management](#step-8-order-management)
- [Step 9: Customer Management](#step-9-customer-management)
- [Step 10: SEO and Marketing](#step-10-seo-and-marketing)
- [Step 11: Security Setup](#step-11-security-setup)
- [Step 12: Performance Optimization](#step-12-performance-optimization)
- [Step 13: Backup and Recovery](#step-13-backup-and-recovery)
- [Step 14: Testing and QA](#step-14-testing-and-qa)
- [Step 15: Production Deployment](#step-15-production-deployment)
- [Step 16: Ongoing Store Management](#step-16-ongoing-store-management)
- [Troubleshooting](#troubleshooting)

## 🎯 Overview

This tutorial creates a fully functional e-commerce store with:
- **E-commerce Plugin Preset**: Complete WooCommerce stack with payment processing
- **Payment Processing**: Multiple payment gateways (Stripe, PayPal)
- **Product Management**: Physical and digital products
- **Order Management**: Complete order workflow
- **Tax and Shipping**: Automated tax calculation and shipping rates
- **Customer Management**: Customer accounts and communication
- **Security**: Secure payment processing and data protection
- **Analytics**: Sales tracking and customer insights

## 🚀 Prerequisites

### Required Software
- **Python 3.9+**
- **DDEV** (for local development)
- **Git** (for version control)
- **VS Code** (recommended editor)

### Required Accounts
- **Stripe Account** (for payment processing)
- **PayPal Business Account** (alternative payment method)
- **Google Account** (for analytics)
- **GitHub Account** (for code hosting)

### Legal Requirements
- **Business License**: Ensure you're legally allowed to sell products
- **Privacy Policy**: Required by most payment processors
- **Terms of Service**: Required for e-commerce operations
- **SSL Certificate**: Required for secure transactions

## 📁 Step 1: E-commerce Project Setup

### 1.1 Create the E-commerce Project

```bash
# Create a new e-commerce project with the ecommerce plugin preset
python3 -m forge local create-project mystore \
  --plugin-preset=ecommerce \
  --admin-user=admin \
  --admin-email=admin@mystore.com \
  --admin-password=SecureStorePass123! \
  --site-title="My E-commerce Store"
```

**Expected Output:**
```
Creating Bedrock project: mystore
Project directory: ~/Work/Wordpress/mystore
Setting up DDEV configuration...
Initializing WordPress...
Installing ecommerce plugin preset...
Installing plugin preset 'E-commerce Store' with 10 plugins
✅ Successfully installed: woocommerce
✅ Successfully installed: wordpress-seo
✅ Successfully installed: w3-total-cache
✅ Successfully installed: wordfence
✅ Successfully installed: contact-form-7
✅ Successfully installed: google-site-kit
✅ Successfully installed: woocommerce-gateway-stripe
✅ Successfully installed: pdf-invoices-packing-slips
✅ Successfully installed: wp-mail-smtp
✅ Successfully installed: really-simple-ssl
✅ Successfully installed: manage-wp
Plugin installation complete: 10/10 plugins installed successfully

🚀 Project created successfully!
📁 Project directory: ~/Work/Wordpress/mystore
🌐 Local URL: https://mystore.ddev.site
👤 Admin URL: https://mystore.ddev.site/wp/wp-admin
👤 Username: admin
🔑 Password: SecureStorePass123!

💡 Next steps:
  cd ~/Work/Wordpress/mystore
  ddev start
  Complete WooCommerce setup wizard
  Configure payment gateways
```

### 1.2 Navigate and Start Development

```bash
# Navigate to project directory
cd ~/Work/Wordpress/mystore

# Start DDEV
ddev start
```

**Expected Output:**
```
Starting mystore...
Network ddev_default created
Container ddev-ssh-agent created
Container ddev-db created
Container ddev-web created
Container ddev-router created
Successfully started mystore
Project can be reached at https://mystore.ddev.site
```

### 1.3 Verify WooCommerce Installation

```bash
# Check WooCommerce installation
ddev wp plugin get woocommerce

# Check active plugins
ddev wp plugin list --status=active
```

**Expected Output:**
```
Plugin: woocommerce
Version: 8.5.2
Status: Active

+------------------------------+--------+-----------+---------+
| name                         | status | update    | version |
+------------------------------+--------+-----------+---------+
| contact-form-7               | active | none      | 5.8     |
| google-site-kit             | active | none      | 1.114.0  |
| manage-wp                    | active | none      | 1.0.0    |
| pdf-invoices-packing-slips   | active | none      | 3.1.1    |
| really-simple-ssl            | active | none      | 7.1.1    |
| woocommerce                 | active | none      | 8.5.2    |
| woocommerce-gateway-stripe   | active | none      | 7.8.0    |
| wordpress-seo                | active | none      | 22.1     |
| w3-total-cache               | active | none      | 2.3.4    |
| wp-mail-smtp                 | active | none      | 3.9.0    |
| wordfence                    | active | none      | 7.10.2   |
+------------------------------+--------+-----------+---------+
```

## 🛒 Step 2: WooCommerce Configuration

### 2.1 Complete WooCommerce Setup Wizard

1. **Access Admin Dashboard**: Go to https://mystore.ddev.site/wp-admin
2. **Login** with admin credentials
3. **Follow Setup Wizard**: WooCommerce will automatically start the setup wizard

### 2.2 Store Details Configuration

```bash
# Configure store details via WP-CLI
ddev wp option update woocommerce_store_address "123 Main Street"
ddev wp option update woocommerce_store_address_2 "Suite 100"
ddev wp option update woocommerce_store_city "New York"
ddev wp option update woocommerce_store_postcode "10001"
ddev wp option update woocommerce_default_country "US:NY"
```

### 2.3 Currency and Payment Settings

```bash
# Configure currency
ddev wp option update woocommerce_currency "USD"
ddev wp option update woocommerce_currency_pos "left"
ddev wp option update woocommerce_price_thousand_sep ","
ddev wp option update woocommerce_price_decimal_sep "."

# Enable tax calculations
ddev wp option update woocommerce_calc_taxes "yes"
ddev wp option update woocommerce_tax_display_shop "incl"
ddev wp option update woocommerce_tax_display_cart "incl"
```

### 2.4 Permalink Configuration

```bash
# Set up SEO-friendly permalinks
ddev wp rewrite structure '/%product_category%/%product%/'
ddev wp rewrite flush
```

## 💳 Step 3: Payment Gateway Setup

### 3.1 Configure Stripe Payment Gateway

```bash
# Configure Stripe settings
ddev wp option update woocommerce_stripe_enabled "yes"
ddev wp option update woocommerce_stripe_testmode "yes"
ddev wp option update woocommerce_stripe_publishable_key "pk_test_..."
ddev wp option update woocommerce_stripe_secret_key "sk_test_..."
ddev wp option update woocommerce_stripe_webhook_secret "whsec_..."
```

**Stripe Setup Steps:**
1. **Create Stripe Account**: Sign up at https://dashboard.stripe.com/register
2. **Get API Keys**: Go to Developers → API keys → Create API keys
3. **Add Test Keys**: Use test keys for development
4. **Configure Webhooks**: Add webhook endpoint `https://mystore.ddev.site/wc-api/wc_stripe`

### 3.2 Configure PayPal (Optional)

```bash
# Install PayPal gateway
ddev wp plugin install woocommerce-gateway-paypal-express-checkout --activate

# Configure PayPal
ddev wp option update woocommerce_paypal_enabled "yes"
ddev wp option update woocommerce_paypal_sandbox "yes"
ddev wp option update woocommerce_paypal_email "your-paypal@example.com"
```

### 3.3 Test Payment Processing

```bash
# Create test product for payment testing
ddev wp post create \
  --post_type=product \
  --post_title="Test Product" \
  --post_content="This is a test product for payment processing." \
  --post_status=publish \
  --meta_input=_price=9.99 \
  --meta_input=_regular_price=9.99 \
  --meta_input=_sku=TEST-001 \
  --meta_input=_manage_stock=yes \
  --meta_input=_stock=100 \
  --meta_input=_stock_status=instock
```

## 📦 Step 4: Product Management

### 4.1 Create Product Categories

```bash
# Create main product categories
ddev wp term create product_cat "Electronics" --description="Electronic devices and accessories"
ddev wp term create product_cat "Clothing" --description="Fashion and apparel"
ddev wp term create product_cat "Books" --description="Books and educational materials"
ddev wp term create product_cat "Home & Garden" --description="Home improvement and garden supplies"

# Create subcategories
ddev wp term create product_cat "Smartphones" --description="Mobile phones and accessories" --parent=$(ddev wp term create product_cat "Electronics" --porcelain --format=json | jq -r '.ID')
ddev wp term create product_cat "Laptops" --description="Notebook computers" --parent=$(ddev wp term list product_cat --field=ID --name="Electronics" --format=csv | cut -d',' -f1)
```

### 4.2 Create Sample Products

```bash
# Create sample electronics product
ddev wp post create \
  --post_type=product \
  --post_title="Premium Smartphone" \
  --post_content="Experience the latest in mobile technology with our premium smartphone. Features include 5G connectivity, advanced camera system, and all-day battery life." \
  --post_status=publish \
  --meta_input=_price=699.99 \
  --meta_input=_regular_price=799.99 \
  --meta_input=_sku=PHONE-001 \
  --meta_input=_manage_stock=yes \
  --meta_input=_stock=50 \
  --meta_input=_stock_status=instock \
  --meta_input=_weight=0.5 \
  --meta_input=_length=15 \
  --meta_input=_width=7 \
  --meta_input=_height=1 \
  --meta_input=_product_attributes="a:2:{i:0;a:3:{s:4:\"name\";s:8:\"Color\";s:3:\"id\";i:0;s:6:\"values\";a:3:{i:0;s:5:\"Black\";i:1;s:6:\"Silver\";i:2;s:4:\"Blue\";}}i:1;a:3:{s:4:\"name\";s:8:\"Storage\";s:3:\"id\";i:1;s:6:\"values\";a:3:{i:0;s:4:\"64GB\";i:1;s:5:\"128GB\";i:2;s:5:\"256GB\";}}}"

# Create sample clothing product
ddev wp post create \
  --post_type=product \
  --post_title="Premium Cotton T-Shirt" \
  --post_content="Comfortable and stylish premium cotton t-shirt. Made from 100% organic cotton with a modern fit." \
  --post_status=publish \
  --meta_input=_price=29.99 \
  --meta_input=_regular_price=39.99 \
  --meta_input=_sku=TSHIRT-001 \
  --meta_input=_manage_stock=yes \
  --meta_input=_stock=100 \
  --meta_input=_stock_status=instock \
  --meta_input=_weight=0.2 \
  --meta_input=_product_attributes="a:1:{i:0;a:3:{s:4:\"name\";s:4:\"Size\";s:3:\"id\";i:2;s:6:\"values\";a:5:{i:0;s:1:\"S\";i:1;s:1:\"M\";i:2;s:1:\"L\";i:3;s:2:\"XL\";i:4;s:3:\"XXL\";}}}"

# Assign products to categories
ddev wp term set product_cat 12 1 --by=name  # Premium Smartphone to Electronics
ddev wp term set product_cat 12 4 --by=name  # Premium Smartphone to Smartphones
ddev wp term set product_cat 13 2 --by=name  # Premium T-Shirt to Clothing
```

### 4.3 Configure Product Images

```bash
# Upload sample product images
ddev exec mkdir -p wp-content/uploads/products

# Add featured images
ddev wp post update 12 --meta_input=_thumbnail_id=1
ddev wp post update 13 --meta_input=_thumbnail_id=2

# Add product gallery images
ddev wp post update 12 --meta_input=_product_image_gallery="3,4,5"
ddev wp post update 13 --meta_input=_product_image_gallery="6,7,8"
```

## 🎨 Step 5: Store Design

### 5.1 Install E-commerce Theme

```bash
# Install Storefront theme (WooCommerce's official theme)
ddev wp theme install storefront --activate

# Install Astra (popular alternative)
ddev wp theme install astra --activate

# Install WooCommerce customizer plugin
ddev wp plugin install woocommerce-customizer --activate
```

### 5.2 Customize Store Appearance

1. **Customize Theme**: Go to Appearance → Customize
2. **Site Identity**: Upload logo and favicon
3. **Colors**: Configure brand colors
4. **Typography**: Choose fonts and sizes
5. **Header**: Add navigation and search
6. **Footer**: Add footer widgets and copyright

### 5.3 Configure WooCommerce Pages

```bash
# Verify WooCommerce pages are created
ddev wp option get woocommerce_cart_page_id
ddev wp option get woocommerce_checkout_page_id
ddev wp option get woocommerce_myaccount_page_id
ddev wp option get woocommerce_shop_page_id
ddev wp option get woocommerce_terms_page_id
```

### 5.4 Create Custom Pages

```bash
# Create About page
ddev wp post create \
  --post_title="About Us" \
  --post_content="Learn more about our store and our commitment to quality products and excellent customer service." \
  --post_status=publish

# Create Contact page
ddev wp post create \
  --post_title="Contact Us" \
  --post_content="Get in touch with our customer service team. We're here to help with any questions about our products or your order." \
  --post_status=publish

# Create Shipping Info page
ddev wp post create \
  --post_title="Shipping Information" \
  --post_content="Everything you need to know about our shipping policies, delivery times, and international shipping options." \
  --post_status=publish
```

## 📊 Step 6: Tax Configuration

### 6.1 Configure Tax Classes

```bash
# Create tax classes
ddev wp wc tax create --country="*" --state="*" --postcode="*" --city="*" --rate=8.25 --name="Standard Tax" --class="standard"
ddev wp wc tax create --country="*" --state="*" --postcode="*" --city="*" --rate=0 --name="Zero Rated" --class="zero-rate"
ddev wp wc tax create --country="*" --state="*" --postcode="*" --city="*" --rate=0 --name="Reduced Rate" --class="reduced-rate"
```

### 6.2 Configure Product Tax Classes

```bash
# Assign tax classes to products
ddev wp post update 12 --meta_input=_tax_class="standard"  # Premium Smartphone
ddev wp post update 13 --meta_input=_tax_class="standard"  # Premium T-Shirt
```

## 📦 Step 7: Shipping Setup

### 7.1 Configure Shipping Zones

```bash
# Create domestic shipping zone
ddev wp wc shipping_zone create --name="United States" --regions="US:*"

# Create international shipping zone
ddev wp wc shipping_zone create --name="International" --regions="DE:*;FR:*;GB:*;CA:*"
```

### 7.2 Configure Shipping Methods

```bash
# Add flat rate shipping to domestic zone
ddev wp wc shipping_zone_method create --zone_id=1 --method_type="flat_rate" --method_title="Standard Shipping" --method_cost=5.99 --method_order=1

# Add free shipping for orders over $50
ddev wp wc shipping_zone_method create --zone_id=1 --method_type="free_shipping" --method_title="Free Shipping" --min_amount=50 --method_order=2

# Add international shipping
ddev wp wc shipping_zone_method create --zone_id=2 --method_type="flat_rate" --method_title="International Shipping" --method_cost=15.99 --method_order=1
```

### 7.3 Configure Product Shipping Classes

```bash
# Create shipping classes
ddev wp wc shipping_class create --name="Heavy Items" --description="Heavy or oversized items"
ddev wp wc shipping_class create --name="Digital Products" --description="Digital downloads and virtual products"

# Assign shipping classes to products
ddev wp post update 12 --meta_input=_shipping_class_id=1  # Premium Smartphone as Heavy Item
```

## 📋 Step 8: Order Management

### 8.1 Configure Order Statuses

```bash
# Create custom order statuses
ddev wp term create shop_order_status "awaiting-payment" --color="#999999"
ddev wp term create shop_order_status "payment-confirmed" --color="#00a0d2"
ddev wp term create shop_order_status "ready-to-ship" --color="#e27730"
ddev wp term create shop_order_status "shipped" --color="#464646"
```

### 8.2 Configure Email Templates

```bash
# Configure email settings
ddev wp option update woocommerce_email_from_name "My Store"
ddev wp option update woocommerce_email_from_address "admin@mystore.com"

# Configure order confirmation email
ddev wp option update woocommerce_email_customer_processing_order_enabled "yes"
ddev wp option update woocommerce_email_customer_completed_order_enabled "yes"
ddev wp option update woocommerce_email_customer_refunded_order_enabled "yes"
```

### 8.3 Configure PDF Invoices

```bash
# Configure PDF invoice settings
ddev wp option update woocommerce_pdf_invoices_enabled "yes"
ddev wp option update woocommerce_pdf_invoices_numbering_prefix="INV-"
ddev wp option update woocommerce_pdf_invoices_company_name "My Store"
ddev wp option update woocommerce_pdf_invoices_company_address "123 Main Street\nNew York, NY 10001"
```

## 👥 Step 9: Customer Management

### 9.1 Configure Customer Registration

```bash
# Enable customer registration
ddev wp option update woocommerce_enable_guest_checkout "no"
ddev wp option update woocommerce_enable_signup_and_login_from_checkout "yes"
ddev wp option update woocommerce_enable_myaccount_registration "yes"
```

### 9.2 Configure Customer Roles

```bash
# Create customer roles
ddev wp role create vip_customer --display_name="VIP Customer"
ddev wp role create wholesale_customer --display_name="Wholesale Customer"

# Add capabilities to customer roles
ddev wp role add_cap vip_customer "read_private_pages"
ddev wp role add_cap wholesale_customer "read_private_products"
```

### 9.3 Configure Customer Communication

```bash
# Configure customer communication settings
ddev wp option update woocommerce_enable_review_reminder_emails "yes"
ddev wp option update woocommerce_review_reminder_days "30"
ddev wp option update woocommerce_customer_email_verification_required "yes"
```

## 🔍 Step 10: SEO and Marketing

### 10.1 Configure SEO for Products

```bash
# Configure product SEO settings
ddev wp option update wpseo_titles "a:1:{s:5:\"title\";s:0:\"\";}"
ddev wp option update wpseo_taxonomy "a:1:{s:15:\"product_cat_tax\";s:0:\"\";}"
ddev wp option update wpseo_xml "a:1:{s:15:\"enable_xmlsitemap\";s:1:\"1\";}"
```

### 10.2 Configure Google Analytics

```bash
# Configure Google Analytics for WooCommerce
ddev wp option update woocommerce_google_analytics_integration "yes"
ddev wp option update woocommerce_google_analytics_tracking_code "GA_MEASUREMENT_ID"
```

### 10.3 Create Marketing Campaigns

```bash
# Create coupon codes
ddev wp wc coupon create --code="WELCOME10" --discount_type="percent" --amount=10 --usage_limit=1 --usage_limit_per_user=1
ddev wp wc coupon create --code="FREESHIP" --discount_type="fixed_cart" --amount=5 --minimum_amount=25

# Create sale prices for products
ddev wp post update 12 --meta_input=_sale_price=599.99  # Discount Premium Smartphone
```

## 🔒 Step 11: Security Setup

### 11.1 Configure SSL and HTTPS

```bash
# Force HTTPS for checkout
ddev wp option update woocommerce_force_ssl_checkout "yes"
ddev wp option update woocommerce_unforce_ssl_checkout "no"

# Configure Really Simple SSL
ddev wp option update rlrsssl_ssl_enabled "yes"
ddev wp option update rlrsssl_ssl_redirect "yes"
```

### 11.2 Configure Payment Security

```bash
# Configure secure payment processing
ddev wp option update woocommerce_stripe_3d_secure_enabled "yes"
ddev wp option update woocommerce_stripe_require_authentication "yes"

# Configure fraud detection
ddev wp option update woocommerce_stripe_max_retry_attempts "3"
ddev wp option update woocommerce_stripe_stripe_checkout_button_text="Pay Securely"
```

### 11.3 Configure Data Protection

```bash
# Configure GDPR compliance
ddev wp option update woocommerce_gdpr_enabled "yes"
ddev wp option update woocommerce_gdpr_cleanup_days="30"
ddev wp option update woocommerce_gdpr_remove_personal_data_on_order_completion "yes"
```

## ⚡ Step 12: Performance Optimization

### 12.1 Configure Caching

```bash
# Configure W3 Total Cache for e-commerce
ddev wp option update w3tc_pgcache_enabled "yes"
ddev wp option update w3tc_dbcache_enabled "yes"
ddev wp option update w3tc_objectcache_enabled "yes"
ddev wp option update w3tc_browsercache_enabled "yes"

# Exclude cache-sensitive pages
ddev wp option update w3tc_pgcache_reject_pages "/cart/,/checkout/,/my-account/"
```

### 12.2 Optimize Product Images

```bash
# Configure Smush for e-commerce
ddev wp option update smush_auto_compress "yes"
ddev wp option update smush_lossy "no"  # Don't use lossy compression for product images
ddev wp option update smush_resize_images "yes"
ddev wp option update smush_backup_original "yes"
```

### 12.3 Optimize Database

```bash
# Optimize database tables
ddev wp db optimize

# Configure WooCommerce database cleanup
ddev wp option update woocommerce_cleanup_options "yes"
ddev wp option update woocommerce_cleanup_logs "yes"
ddev wp option update woocommerce_cleanup_transient "yes"
```

## 💾 Step 13: Backup and Recovery

### 13.1 Configure Regular Backups

```bash
# Create backup script
cat > backup-ecommerce.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/home/user/backups/mystore"

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup database
ddev wp db export $BACKUP_DIR/mystore_db_$DATE.sql

# Backup uploads
tar -czf $BACKUP_DIR/mystore_uploads_$DATE.tar.gz wp-content/uploads/

# Backup plugin configurations
tar -czf $BACKUP_DIR/mystore_plugins_$DATE.tar.gz wp-content/plugins/

# Keep last 30 days of backups
find $BACKUP_DIR -name "*.sql" -mtime +30 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +30 -delete
EOF

chmod +x backup-ecommerce.sh
```

### 13.2 Configure Automatic Backups

```bash
# Add to crontab
(crontab -l 2>/dev/null; echo "0 2 * * * /path/to/backup-ecommerce.sh") | crontab -
```

### 13.3 Configure Offsite Backups

```bash
# Configure Google Drive backup
python3 -m forge sync configure --provider=google_drive --project=mystore

# Configure daily backup schedule
python3 -m forge sync backup mystore --schedule=daily --include-plugins --include-uploads
```

## 🧪 Step 14: Testing and QA

### 14.1 Test Complete Purchase Flow

```bash
# Create test customer account
ddev wp user create testuser --user_pass=testpass123 --user_email=testuser@example.com --role=customer

# Test add to cart
ddev wp wc cart add 12 --quantity=1  # Add Premium Smartphone to cart
ddev wp wc cart add 13 --quantity=2  # Add 2 Premium T-Shirts to cart

# Check cart contents
ddev wp wc cart list
```

### 14.2 Test Payment Processing

```bash
# Create test order
ddev wp wc create_order --customer_id=2 --status=pending

# Add products to order
ddev wp wc add_order_item 12 --quantity=1
ddev wp wc add_order_item 13 --quantity=2

# Calculate totals
ddev wp wc update_order 1 --calculate_totals

# Check order details
ddev wp wc get order 1
```

### 14.3 Test Tax and Shipping Calculations

```bash
# Test tax calculation
ddev wp wc calculate_tax --amount=100 --country="US" --state="NY"

# Test shipping calculation
ddev wp wc calculate_shipping --package_weight=2 --country="US" --state="NY"
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
python3 -m forge sync backup mystore --pre-deployment

# Export products and categories
ddev wp export --dir=.forge/exports --post_type=product --post_type=product_cat
```

### 15.2 Deploy to Production

```bash
# Deploy to production server
python3 -m forge deploy mystore production \
  --method=ssh \
  --host=your-server.com \
  --user=sshuser \
  --path=/var/www/mystore

# Configure production environment
python3 -m forge config set --project=mystore env=production
python3 -m forge config set --project=mystore debug_mode=false
python3 -m forge config set --project=mystore cache_enabled=true
```

### 15.3 Production Configuration

```bash
# Configure production settings
ddev wp option update woocommerce_store_address "123 Main Street"
ddev wp option update woocommerce_default_country "US"
ddev wp option update woocommerce_currency "USD"

# Configure production SSL
ddev wp option update woocommerce_force_ssl_checkout "yes"

# Configure production payment gateways
ddev wp option update woocommerce_stripe_enabled "yes"
ddev wp option update woocommerce_stripe_testmode "no"
ddev wp option update woocommerce_stripe_publishable_key "pk_live_..."
ddev wp option update woocommerce_stripe_secret_key "sk_live_..."
```

## 🔄 Step 16: Ongoing Store Management

### 16.1 Daily Management Tasks

```bash
# Check for new orders
ddev wp wc get orders --status=processing

# Monitor inventory levels
ddev wp wc get products --status=lowstock

# Check site performance
python3 -m forge monitor check mystore
```

### 16.2 Weekly Management Tasks

```bash
# Update products and inventory
ddev wp wc update_stock --all

# Review customer feedback
ddev wp comment list --status=hold

# Run security scans
ddev wf scan
```

### 16.3 Monthly Management Tasks

```bash
# Update plugins
ddev wp plugin update --all

# Update WordPress core
ddev wp core update

# Review sales reports
ddev wp wc report sales --period=month

# Backup database
ddev wp db export ~/backups/mystore_monthly_$(date +%Y%m).sql
```

## 🛠 Troubleshooting

### Common E-commerce Issues

#### Payment Gateway Issues
```bash
# Check payment gateway status
ddev wp wc payment_gateways

# Check order logs
ddev wp wc order_logs --order_id=1

# Test webhook delivery
curl -X POST https://api.stripe.com/v1/webhooks/whsec_... --data '{}'
```

#### Inventory Issues
```bash
# Check stock levels
ddev wp wc get low_stock_products

# Update stock quantity
ddev wp wc update_product 12 --stock_quantity=100

# Manage stock reservations
ddev wp wc get_stock_reservations
```

#### Performance Issues
```bash
# Check slow queries
ddev query monitor

# Optimize database
ddev wp db optimize

# Clear caches
ddev wp cache flush all
```

### Getting Help

```bash
# Check system status
python3 -m forge info --project=mystore

# Get detailed logs
ddev logs

# Check WooCommerce status
ddev wp wc status

# Run health check
ddev wp health check
```

## ✅ Next Steps

Congratulations! Your e-commerce store is now live and ready for business. Here's what to do next:

1. **Add Real Products**: Replace sample products with your actual inventory
2. **Configure Payment Gateways**: Set up live payment processing
3. **Set Up Email Marketing**: Configure email campaigns and newsletters
4. **Monitor Analytics**: Track sales, customer behavior, and performance
5. **Provide Customer Support**: Set up customer service processes
6. **Regular Maintenance**: Keep plugins updated and security patches applied

## 📚 Additional Resources

- [Plugin System Guide](../PLUGIN_SYSTEM.md)
- [Configuration Guide](../CONFIGURATION.md)
- [Security Best Practices](../SECURITY_GUIDE.md)
- [Performance Optimization Guide](../PERFORMANCE_OPTIMIZATION.md)
- [Troubleshooting Guide](../TROUBLESHOOTING.md)

## 🎉 Success Checklist

- [ ] E-commerce project created with ecommerce plugin preset
- [ ] WooCommerce fully configured
- [ ] Payment gateways set up (Stripe/PayPal)
- [ ] Products and categories created
- [ ] Tax and shipping configured
- [ ] Store design customized
- [ ] Customer management set up
- [ ] SEO and marketing configured
- [ ] Security measures implemented
- [ ] Performance optimized
- [ ] Backup strategy in place
- [ ] Payment flow tested
- [ ] Production deployment successful
- [ ] Ongoing management workflow established

Your professional e-commerce store is now ready for business! 🛒✨