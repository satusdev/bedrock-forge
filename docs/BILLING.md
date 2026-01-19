# Billing & Asset Management

Complete billing system for managing client subscriptions, domains, SSL certificates, and hosting packages.

## 📋 Table of Contents

- [Overview](#overview)
- [Subscriptions](#subscriptions)
- [Domains](#domains)
- [SSL Certificates](#ssl-certificates)
- [Hosting Packages](#hosting-packages)
- [API Reference](#api-reference)

---

## 🎯 Overview

The billing system provides comprehensive asset and subscription management for WordPress hosting services. Track renewals, generate invoices, and receive expiry alerts.

### Key Features

| Feature | Description |
|---------|-------------|
| **Subscriptions** | Recurring services with flexible billing cycles |
| **Domains** | Domain registration and expiry tracking |
| **SSL Certificates** | Certificate monitoring and renewal alerts |
| **Hosting Packages** | Package definitions with tiered pricing |
| **Invoice Generation** | Automatic invoice creation from subscriptions |
| **Expiry Alerts** | Configurable reminders before renewals |

---

## 📦 Subscriptions

Manage recurring services with flexible billing cycles.

### Subscription Types

| Type | Description |
|------|-------------|
| `hosting` | Web hosting services |
| `domain` | Domain registration |
| `ssl` | SSL certificates |
| `maintenance` | Website maintenance |
| `support` | Technical support |
| `backup` | Backup services |
| `cdn` | CDN services |
| `email` | Email hosting |

### Billing Cycles

| Cycle | Duration | Use Case |
|-------|----------|----------|
| `monthly` | 1 month | Short-term clients |
| `quarterly` | 3 months | Small businesses |
| `biannual` | 6 months | Medium-term contracts |
| `yearly` | 12 months | **Recommended for hosting** |
| `biennial` | 24 months | Long-term discounts |
| `triennial` | 36 months | Maximum savings |

### API Endpoints

```
GET    /api/v1/subscriptions              # List subscriptions
GET    /api/v1/subscriptions/expiring     # Expiring soon
POST   /api/v1/subscriptions              # Create subscription
GET    /api/v1/subscriptions/{id}         # Get details
PUT    /api/v1/subscriptions/{id}         # Update
DELETE /api/v1/subscriptions/{id}         # Cancel
POST   /api/v1/subscriptions/{id}/renew   # Manual renewal
POST   /api/v1/subscriptions/{id}/invoice # Generate invoice
GET    /api/v1/subscriptions/stats/summary # Statistics
```

---

## 🌐 Domains

Track domain registrations with expiry alerts.

### Supported Registrars

- Namecheap
- GoDaddy
- Cloudflare
- Google Domains
- Porkbun
- Hover
- Dynadot

### Domain Features

| Feature | Default |
|---------|---------|
| Auto-renew tracking | ✅ Enabled |
| Privacy protection | ✅ Enabled |
| Transfer lock | ✅ Enabled |
| Reminder days | 60 days |
| WHOIS caching | ✅ Enabled |

### API Endpoints

```
GET    /api/v1/domains              # List domains
GET    /api/v1/domains/expiring     # Expiring soon
POST   /api/v1/domains              # Add domain
GET    /api/v1/domains/{id}         # Get with SSL info
PUT    /api/v1/domains/{id}         # Update
DELETE /api/v1/domains/{id}         # Remove
POST   /api/v1/domains/{id}/renew   # Mark renewed
GET    /api/v1/domains/stats/summary # Statistics
```

---

## 🔒 SSL Certificates

Monitor SSL certificates and receive expiry alerts.

### Supported Providers

| Provider | Free | Auto-Renew |
|----------|------|------------|
| Let's Encrypt | ✅ | ✅ |
| Cloudflare | ✅ | ✅ |
| CyberPanel | ✅ | ✅ |
| Comodo | ❌ | ❌ |
| DigiCert | ❌ | ❌ |
| Sectigo | ❌ | ❌ |

### Certificate Types

- `DV` - Domain Validated
- `OV` - Organization Validated
- `EV` - Extended Validation
- `WILDCARD` - Wildcard certificates
- `MULTI_DOMAIN` - SAN certificates

### API Endpoints

```
GET    /api/v1/ssl              # List certificates
GET    /api/v1/ssl/expiring     # Expiring soon (14 days)
POST   /api/v1/ssl              # Add certificate
GET    /api/v1/ssl/{id}         # Get details
PUT    /api/v1/ssl/{id}         # Update
DELETE /api/v1/ssl/{id}         # Remove
POST   /api/v1/ssl/{id}/renew   # Mark renewed
GET    /api/v1/ssl/stats/summary # Statistics
```

---

## 📊 Hosting Packages

Define hosting packages with resource limits and pricing.

### Resource Limits

| Resource | Description |
|----------|-------------|
| `disk_space_gb` | Disk space in GB |
| `bandwidth_gb` | Monthly bandwidth |
| `domains_limit` | Number of domains |
| `databases_limit` | MySQL databases |
| `email_accounts_limit` | Email accounts |
| `php_workers` | PHP worker processes |
| `ram_mb` | RAM allocation |
| `cpu_cores` | CPU core allocation |

### Tiered Pricing

Packages support multiple billing cycles with automatic savings calculation:

```json
{
  "monthly_price": 19.99,
  "quarterly_price": 54.99,
  "yearly_price": 179.99,
  "biennial_price": 299.99,
  "savings_percentage": {
    "quarterly": 8.3,
    "yearly": 25.0,
    "biennial": 37.5
  }
}
```

### API Endpoints

```
GET    /api/v1/packages         # List packages
GET    /api/v1/packages/{id}    # Get with pricing comparison
POST   /api/v1/packages         # Create package
PUT    /api/v1/packages/{id}    # Update
DELETE /api/v1/packages/{id}    # Deactivate
```

---

## 🔧 Configuration

### Default Settings

```yaml
billing:
  default_cycle: yearly
  default_currency: USD
  payment_terms: NET30

reminders:
  subscription: 30  # days
  domain: 60        # days
  ssl: 14           # days

auto_invoice:
  enabled: true
  send_immediately: false
```

---

## 📖 Related Documentation

- [API Reference](API.md) - Complete API documentation
- [CyberPanel Guide](CYBERPANEL.md) - Server management
- [Configuration](CONFIGURATION.md) - System configuration
