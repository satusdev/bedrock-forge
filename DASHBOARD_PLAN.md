# Bedrock Forge Dashboard - ManageWP Replacement Plan

## Overview
This document outlines the development plan for transforming Bedrock Forge into a comprehensive WordPress management platform that replaces ManageWP. The dashboard will serve as a centralized hub for managing WordPress projects with GitHub integration, Google Drive backup management, and complete project information management.

## Vision: Complete WordPress Management Hub
Bedrock Forge will become the definitive ManageWP replacement with:
- **Centralized Project Management**: Single source of truth for all WordPress projects
- **GitHub Integration**: Direct repository management and Git workflows
- **Google Drive Integration**: Seamless backup storage and file management
- **All-in-One Information**: Complete project details including servers, clients, billing, and more
- **Local Development Focus**: Unique DDEV integration for development workflows
- **Modern UI**: Built with ChadCDN for professional, responsive interface

## Key Differentiators from ManageWP

### 1. **Local Development Integration** 🚀
- **DDEV Management**: Direct control of local WordPress environments
- **Development Workflow**: Seamless transition from local to staging to production
- **Database Sync**: Easy database synchronization between environments
- **WordPress Debugging**: Advanced debugging tools and error tracking

### 2. **Flexible Hosting Agnostic** 🌐
- **Multiple Providers**: Support for Hetzner, CyberPanel, LibyanSpider, and more
- **Self-Hosted Option**: No vendor lock-in - host it yourself
- **Custom Integrations**: Add any hosting provider via API
- **Cost Transparency**: Clear breakdown of all hosting costs

### 3. **Developer-First Approach** 💻
- **Git-Centric Workflow**: Version control at the core of everything
- **API-First Design**: Full API access for automation and custom tools
- **Open Source**: Full code transparency and community contributions
- **Custom Workflows**: Build your own automation pipelines

### 4. **Complete Data Ownership** 🔒
- **Your Data, Your Rules**: No data mining or selling user information
- **Self-Hosted Option**: Keep everything on your own infrastructure
- **Export Freedom**: Easy data export to other platforms
- **Privacy First**: GDPR and privacy regulation compliant

### 5. **Cost-Effective Pricing** 💰
- **No Per-Site Pricing**: Unlimited projects without additional costs
- **One-Time Setup**: No recurring subscription fees for self-hosted
- **Transparent Costs**: Only pay for what you use (hosting, storage)
- **No Hidden Fees**: Clear pricing structure with no surprises

### 6. **Enhanced Integrations** 🔗
- **GitHub Deep Integration**: Not just links, but full repository management
- **Google Drive Backup**: Visual backup browser and restore interface
- **Uptime Kuma**: Open-source monitoring integration
- **Custom API Support**: Connect to any service with webhooks

### 7. **Modern Technology Stack** ⚡
- **ChadCDN UI**: Professional, modern interface
- **Real-Time Updates**: WebSocket-powered live updates
- **Performance Optimized**: Fast loading and responsive design
- **Mobile First**: Full mobile and tablet support

## Phase 1: Foundation & Core Dashboard Setup

### 1.1 API Infrastructure ✅ COMPLETED
- [x] Extend FastAPI with dashboard-specific endpoints
- [x] Create dashboard routes (`forge/api/dashboard_routes.py`)
- [x] Integrate dashboard routes into main API app

**Completed Features:**
- Dashboard statistics endpoint
- Project status listing
- Individual project status
- Quick project actions (start/stop DDEV, git operations)
- Background task execution
- Basic configuration endpoints

### 1.2 Dashboard Configuration System 🔄 IN PROGRESS
**Goal**: Create persistent dashboard configuration and settings management

**Implementation Plan:**
```python
# File: forge/api/dashboard_config.py
class DashboardConfig:
    - Theme management (light/dark)
    - User preferences
    - Notification settings
    - Widget configuration
    - Auto-refresh intervals
```

**Key Features:**
- JSON-based configuration storage
- User preference persistence
- Widget layout customization
- Notification preferences
- API rate limiting settings

### 1.3 Authentication & Security
**Goal**: Implement secure access control for the dashboard

**Implementation Plan:**
- JWT token authentication
- API key management
- Session management
- Role-based access control (admin/user)
- CSRF protection
- Rate limiting

### 1.4 Real-time Data Collection
**Goal**: Set up real-time data collection from CLI commands

**Implementation Plan:**
- Background task scheduling
- WebSocket connections for live updates
- Data caching strategies
- Event-driven updates
- Status polling optimization

### 1.5 Responsive Layout Framework with ChadCDN
**Goal**: Create a modern, responsive dashboard interface using ChadCDN

**Technology Stack:**
- **Frontend**: React + TypeScript
- **UI Framework**: ChadCDN (replacing Tailwind CSS)
- **Charts**: Chart.js / Recharts
- **Icons**: Lucide React (ChadCDN compatible)
- **State Management**: Zustand
- **HTTP Client**: Axios
- **WebSocket**: Socket.io-client

**ChadCDN Integration:**
- Pre-built professional components
- Built-in accessibility and responsive design
- Modern design system with consistent styling
- Faster development with component library
- Professional appearance out-of-the-box

## Phase 2: Comprehensive Project Hub (ManageWP Core)

### 2.1 All-in-One Project Information Dashboard
**Complete Project Management:**
- **Project Overview**: Name, URL, status, health score, last updated
- **GitHub Integration**: Repository links, branch status, commit history, pull requests
- **Environment URLs**: Live site, staging, local development (DDEV)
- **Server Information**: Hosting provider, server specs, SSH details, resource usage
- **Database Details**: Credentials, backup locations, connection status
- **WordPress Information**: Core version, theme, plugins, user roles
- **SSL Certificate**: Status, expiry date, issuer, auto-renewal settings
- **Client Information**: Contact details, billing status, contract terms
- **Backup Status**: Last backup, storage location, restore options
- **Analytics**: Traffic, performance, uptime, error logs

### 2.2 GitHub API Integration
**Features:**
- **Repository Management**: Clone, pull, push, branch operations
- **Commit History**: Visual timeline with author and message details
- **Pull Request Management**: Create, review, merge PRs
- **Deployment Integration**: Auto-deploy on merge to specific branches
- **Webhook Configuration**: Set up GitHub webhooks for automatic updates
- **Issue Tracking**: Integration with GitHub Issues
- **Collaboration**: Team member access and permissions

### 2.3 Google Drive Integration
**Features:**
- **Backup Storage**: Automatic backup uploads to Google Drive
- **File Management**: Browse and manage project files in Drive
- **Sharing**: Secure file sharing with clients and team members
- **Version History**: Track backup versions and restore points
- **Storage Analytics**: Monitor storage usage and costs
- **Document Management**: Store project documentation, contracts, invoices

### 2.4 Project Listing Interface
**Enhanced Features:**
- **Advanced Filtering**: By status, client, hosting provider, WordPress version
- **Custom Views**: Save and share filtered project lists
- **Bulk Operations**: Mass updates, backups, deployments
- **Status Indicators**: Real-time health, security, and update status
- **Quick Actions**: One-click common operations
- **Client Grouping**: Organize projects by client or category

### 2.2 Quick Actions Interface
**Actions:**
- Start/Stop DDEV
- Open in browser
- Git pull/push
- Quick deploy
- Backup now
- View logs

### 2.3 Project Creation Wizard
**Steps:**
1. Project name and location
2. WordPress configuration
3. Git repository setup
4. Initial plugins selection
5. Development environment setup

### 2.4 Configuration Management
**Features:**
- Environment variables editor
- WordPress settings manager
- Plugin management
- Theme management
- Database configuration

### 2.5 Client & Billing Management
**Client Relationship Features:**
- **Client Profiles**: Contact information, company details, billing history
- **Project Assignment**: Link multiple projects to single client
- **Billing Integration**: Invoice generation, payment tracking, subscription management
- **Contract Management**: Store contracts, SLAs, renewal dates
- **Communication Log**: Track all client interactions and notes
- **Client Portal**: Limited access for clients to view project status and reports

### 2.6 Advanced Backup Management
**Visual Backup Interface:**
- **Backup Browser**: Visual file browser for all backups (Google Drive + local)
- **Restore Wizard**: Step-by-step restore process with preview
- **Backup Scheduling**: Automated backups with custom schedules
- **Backup Verification**: Automatic integrity checks and restore testing
- **Storage Management**: Monitor storage usage across all backup locations
- **Emergency Restore**: Quick restore procedures for critical situations

### 2.7 Local Development Integration
**DDEV Management:**
- **Environment Control**: Start/stop/restart DDEV from web interface
- **Resource Monitoring**: CPU, memory, disk usage for DDEV containers
- **Database Management**: Import/export, query browser, user management
- **WordPress Debugging**: Error logs, debug console, performance profiling
- **Sync Tools**: Database sync between local/staging/production
- **Development Workflow**: Integrated Git workflow from local to production

### 2.8 Plugin & Theme Inventory
**Complete Asset Management:**
- **Plugin Repository**: Browse, install, update WordPress plugins
- **Theme Management**: Install, customize, update WordPress themes
- **Version Control**: Track plugin/theme versions across all projects
- **Security Scanning**: Automated vulnerability scanning
- **Bulk Operations**: Update plugins/themes across multiple projects
- **Compatibility Checking**: WordPress version compatibility verification

## Phase 3: Advanced Deployment & Server Management

### 3.1 Server Inventory
**Features:**
- Server list with status
- Resource usage monitoring
- Service health checks
- SSH connection status
- SSL certificate status

### 3.2 Visual Deployment Pipeline
**Components:**
- Pipeline stages visualization
- Real-time deployment progress
- Rollback capabilities
- Deployment history
- Branch management

### 3.3 Deployment History & Rollback
**Features:**
- Deployment timeline
- Version comparison
- One-click rollback
- Deployment logs
- Success/failure analytics

### 3.4 SSL Certificate Management
**Features:**
- Certificate expiry monitoring
- Auto-renewal settings
- Certificate generation
- Chain verification
- Security scanning

### 3.5 Backup Management
**Features:**
- Backup scheduling
- Cloud storage integration
- Restore interface
- Backup verification
- Storage analytics

## Phase 4: Monitoring & Analytics

### 4.1 Uptime Monitoring
**Integration**: Uptime Kuma API
**Features:**
- Site availability charts
- Response time tracking
- Downtime incidents
- Alert management
- SLA monitoring

### 4.2 Performance Metrics
**Metrics:**
- Page load times
- Database performance
- Server resource usage
- WordPress performance
- User experience metrics

### 4.3 Log Aggregation
**Features:**
- Centralized log collection
- Log search and filtering
- Real-time log streaming
- Log parsing and analysis
- Alert on patterns

### 4.4 Backup Analytics
**Features:**
- Storage usage trends
- Backup success rates
- Restore testing results
- Cost optimization
- Retention policy management

### 4.5 Alert Management
**Features:**
- Alert rule configuration
- Notification channels (email, Slack, webhook)
- Alert escalation
- Acknowledgment system
- Alert analytics

## Phase 5: Advanced Features & Polish

### 5.1 Real-time Updates
**Technology**: WebSocket + Redis
**Features:**
- Live status updates
- Real-time log streaming
- Instant notifications
- Collaborative features
- Event broadcasting

### 5.2 Team Collaboration & Client Portal
**Team Features:**
- **User Management**: Invite team members with role-based permissions
- **Activity Logs**: Track all actions and changes across projects
- **Shared Workspaces**: Collaborate on projects with real-time updates
- **Client Portal**: Secure access for clients to view project status
- **Notifications**: Custom alerts for team members and clients
- **Comment System**: Discuss projects and issues with team and clients

### 5.3 Multi-site Management
**Enhanced Features:**
- Site grouping and tagging
- Bulk operations across projects
- Cross-site analytics and reporting
- Template management for quick setup
- Multi-tenant support with isolation

### 5.3 Plugin Management
**Features:**
- Plugin repository browsing
- Version management
- Compatibility checking
- Security scanning
- Auto-updates

### 5.4 Workflow Automation
**Features:**
- Visual workflow builder
- Custom triggers
- Action chaining
- Conditional logic
- Scheduled workflows

### 5.5 Theme & Mobile Support
**Features:**
- Dark/light theme toggle
- Custom color schemes
- Mobile-responsive design
- Touch-optimized interface
- Progressive web app

## Technical Architecture

### Backend (FastAPI)
```
forge/api/
├── app.py                    # Main FastAPI application
├── routes.py                 # Existing API routes
├── dashboard_routes.py       # Dashboard-specific routes ✅
├── dashboard_config.py       # Configuration management
├── auth.py                   # Authentication system
├── websocket.py              # WebSocket handlers
├── background_tasks.py       # Background task management
└── middleware.py             # Custom middleware
```

### Frontend (React)
```
dashboard/
├── public/
├── src/
│   ├── components/           # Reusable UI components
│   │   ├── common/          # Shared components
│   │   ├── projects/        # Project-related components
│   │   ├── servers/         # Server management components
│   │   └── monitoring/      # Monitoring components
│   ├── pages/               # Page components
│   │   ├── Dashboard.tsx    # Main dashboard
│   │   ├── Projects.tsx     # Project management
│   │   ├── Servers.tsx      # Server management
│   │   └── Settings.tsx     # Settings page
│   ├── hooks/               # Custom React hooks
│   ├── services/            # API services
│   ├── stores/              # State management
│   ├── utils/               # Utility functions
│   └── types/               # TypeScript definitions
├── package.json
└── tailwind.config.js
```

### Database Schema
```sql
-- Users and authentication
users (id, username, email, role, created_at)
sessions (id, user_id, token, expires_at)

-- Dashboard configuration
dashboard_configs (user_id, config_json, updated_at)

-- Monitoring data
project_metrics (project_id, timestamp, metric_type, value)
server_metrics (server_id, timestamp, cpu, memory, disk)
deployment_logs (id, project_id, status, started_at, completed_at)

-- Background tasks
tasks (id, type, status, data, created_at, completed_at)
```

## API Endpoints

### Dashboard APIs
```
GET    /api/v1/dashboard/stats           # Dashboard statistics
GET    /api/v1/dashboard/projects        # Project status list
GET    /api/v1/dashboard/projects/{id}   # Single project details
POST   /api/v1/dashboard/projects/{id}/action  # Execute action
GET    /api/v1/dashboard/tasks/{id}      # Task status
GET    /api/v1/dashboard/config          # Get configuration
PUT    /api/v1/dashboard/config          # Update configuration
GET    /api/v1/dashboard/health          # Health check
```

### Authentication APIs
```
POST   /api/v1/auth/login                # User login
POST   /api/v1/auth/logout               # User logout
POST   /api/v1/auth/refresh              # Refresh token
GET    /api/v1/auth/profile              # User profile
```

### WebSocket Events
```
project_status_update    # Real-time project status
deployment_progress      # Deployment progress updates
server_metrics           # Server monitoring data
system_alerts           # System notifications
```

## Development Workflow

### Phase 1 (Week 1-2)
1. Set up backend API infrastructure ✅
2. Implement configuration management
3. Create basic authentication system
4. Set up data collection background tasks
5. Create frontend project structure

### Phase 2 (Week 3-4)
1. Build project listing interface
2. Implement quick actions
3. Create project creation wizard
4. Add configuration management UI
5. Implement local development monitoring

### Phase 3 (Week 5-6)
1. Create server inventory interface
2. Build deployment pipeline visualization
3. Implement deployment history
4. Add SSL certificate management
5. Create backup management interface

### Phase 4 (Week 7-8)
1. Integrate uptime monitoring
2. Implement performance metrics
3. Create log aggregation interface
4. Add backup analytics
5. Build alert management system

### Phase 5 (Week 9-10)
1. Implement WebSocket for real-time updates
2. Create multi-site management
3. Build plugin management interface
4. Implement workflow automation
5. Add theme support and mobile optimization

## Dependencies

### Backend Dependencies
```txt
# Existing dependencies
fastapi>=0.104.0
uvicorn[standard]>=0.24.0
pydantic>=2.0

# New dependencies for dashboard
redis>=5.0.0                    # Caching and session storage
python-jose[cryptography]>=3.3  # JWT tokens
passlib[bcrypt]>=1.7           # Password hashing
python-multipart>=0.0.6       # Form data handling
websockets>=12.0               # WebSocket support
sqlalchemy>=2.0               # Database ORM
alembic>=1.12                 # Database migrations

# GitHub Integration
PyGithub>=2.0                  # GitHub API client
gitpython>=3.1                 # Git operations

# Google Drive Integration
google-api-python-client>=2.100  # Google API client
google-auth-httplib2>=0.1.0     # Google authentication
google-auth-oauthlib>=1.0.0     # Google OAuth

# Additional integrations
psutil>=5.9                    # System monitoring
boto3>=1.28                    # AWS S3 (optional backup)
aiohttp>=3.8                   # Async HTTP client
```

### Frontend Dependencies
```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "typescript": "^5.0.0",
    "axios": "^1.5.0",
    "zustand": "^4.4.0",
    "react-router-dom": "^6.15.0",
    "lucide-react": "^0.279.0",
    "chart.js": "^4.4.0",
    "react-chartjs-2": "^5.2.0",
    "socket.io-client": "^4.7.0",
    "react-hook-form": "^7.45.0",
    "date-fns": "^2.30.0",
    "@tanstack/react-query": "^4.32.0",
    "react-hot-toast": "^2.4.0",
    "react-dropzone": "^14.2.0",
    "react-modal": "^3.16.0",
    "react-table": "^7.8.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.0.0",
    "vite": "^4.4.0",
    "eslint": "^8.45.0",
    "@types/react": "^18.2.0",
    "@types/react-modal": "^3.16.0"
  }
}

### ChadCDN Integration
```html
<!-- ChadCDN CSS -->
<link rel="stylesheet" href="https://chadcdn.com/latest/chadcdn.min.css">

<!-- ChadCDN JS -->
<script src="https://chadcdn.com/latest/chadcdn.min.js"></script>

<!-- Or import as ES module -->
<script type="module">
  import { Button, Card, Modal } from 'https://chadcdn.com/latest/chadcdn.esm.js';
</script>
```

## Security Considerations

1. **Authentication**
   - JWT token expiration and refresh
   - Secure password storage
   - Rate limiting on auth endpoints
   - Session management

2. **API Security**
   - CORS configuration
   - Input validation and sanitization
   - SQL injection prevention
   - XSS protection

3. **Dashboard Security**
   - Role-based access control
   - Audit logging
   - Secure file uploads
   - Environment variable protection

## Performance Considerations

1. **Backend Optimization**
   - Database query optimization
   - Response caching
   - Background task queuing
   - API rate limiting

2. **Frontend Optimization**
   - Code splitting
   - Lazy loading
   - Image optimization
   - Bundle size optimization

3. **Real-time Updates**
   - WebSocket connection pooling
   - Event throttling
   - Efficient data structures
   - Connection error handling

## Testing Strategy

### Backend Testing
- Unit tests for API endpoints
- Integration tests for database operations
- WebSocket connection testing
- Authentication flow testing

### Frontend Testing
- Component unit tests
- Integration tests for user flows
- API service testing
- E2E testing with Playwright

### Performance Testing
- Load testing for API endpoints
- WebSocket stress testing
- Database performance testing
- Frontend performance profiling

## Deployment Strategy

### Development Environment
- Local development with Docker Compose
- Hot reload for frontend
- Auto-reload for backend
- Local Redis and SQLite

### Production Environment
- Docker containerization
- PostgreSQL database
- Redis cluster
- Nginx reverse proxy
- SSL/TLS termination

## Monitoring & Maintenance

1. **Application Monitoring**
   - Health check endpoints
   - Performance metrics collection
   - Error tracking and alerting
   - Log aggregation

2. **Infrastructure Monitoring**
   - Server resource monitoring
   - Database performance
   - Network latency
   - SSL certificate expiry

3. **Backup & Recovery**
   - Regular database backups
   - Configuration backups
   - Disaster recovery plan
   - Testing restore procedures

## Future Enhancements

### Short-term (3-6 months)
- Advanced analytics and reporting
- Integration with more hosting providers
- Plugin marketplace integration
- Advanced workflow automation

### Long-term (6-12 months)
- Multi-tenant SaaS offering
- Advanced AI-powered recommendations
- Mobile applications
- Enterprise SSO integration

---

*This document will be continuously updated as the development progresses. Last updated: [Current Date]*