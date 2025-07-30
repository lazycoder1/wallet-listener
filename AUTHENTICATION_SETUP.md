# Wallet Watcher Authentication Setup Guide

## 🛡️ Overview

We've implemented a complete server-side authentication system to replace the insecure client-side authentication. This guide walks you through setting up and using the new system.

## 🏗️ Architecture

- **Backend**: JWT-based authentication with secure password hashing
- **Database**: User and session management with PostgreSQL + Prisma
- **Frontend**: API client with automatic token management
- **Security**: All routes protected with server-side validation

## 📋 Setup Steps

### 1. Install Backend Dependencies

```bash
cd backend
bun install
```

### 2. Database Migration

```bash
cd backend
bun db:generate
bun db:migrate
```

### 3. Environment Variables

Create/update `backend/.env`:

```env
DATABASE_URL="your_postgresql_connection_string"
JWT_SECRET="your-super-secret-jwt-key-256-bits-minimum"
INITIAL_ADMIN_USERNAME="admin"
INITIAL_ADMIN_PASSWORD="your-secure-password"
INITIAL_ADMIN_EMAIL="admin@walletshark.io"
```

⚠️ **IMPORTANT**: Change the JWT_SECRET to a secure random string in production!

### 4. Create Initial Admin User

```bash
cd backend
bun setup:admin
```

### 5. Install Frontend Dependencies

```bash
cd frontend
npm install
# or
pnpm install
```

### 6. Frontend Environment Variables

Create/update `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## 🚀 Starting the Application

### Backend
```bash
cd backend
bun dev
```

### Frontend
```bash
cd frontend
npm run dev
# or
pnpm dev
```

## 🔐 How It Works

### Authentication Flow

1. **Login**: User submits credentials → Backend validates → Returns JWT token
2. **Token Storage**: Frontend stores JWT in localStorage
3. **API Requests**: All requests include `Authorization: Bearer <token>` header
4. **Route Protection**: Backend middleware validates token on protected routes
5. **Session Management**: Tokens expire after 24 hours, can be invalidated on logout

### Protected Routes

**Backend Routes:**
- `GET/POST/PUT/DELETE /companies/*` - Company management
- `POST /imports` - Address uploads
- `GET /auth/me` - Current user info
- `POST /auth/register` - Create new users (admin only)

**Frontend Pages:**
- `/` - Home page
- `/upload` - Upload addresses
- `/admin/*` - Admin panel

## 🎯 Login Credentials

**Default Admin Account:**
- Username: `admin` (or from INITIAL_ADMIN_USERNAME)
- Password: `admin123` (or from INITIAL_ADMIN_PASSWORD)

⚠️ **Change the default password immediately after first login!**

## 🔧 API Endpoints

### Authentication
- `POST /auth/login` - User login
- `POST /auth/logout` - User logout  
- `GET /auth/me` - Get current user
- `POST /auth/register` - Create user (requires auth)

### Companies  
- `GET /companies` - List companies (requires auth)
- `POST /companies` - Create company (requires auth)
- `GET /companies/:id` - Get company (requires auth)
- `PUT /companies/:id` - Update company (requires auth)
- `DELETE /companies/:id` - Delete company (requires auth)

### Imports
- `POST /imports` - Import addresses (requires auth)

## 🛠️ Development Commands

### Backend
```bash
bun dev                 # Start development server
bun setup:admin         # Create initial admin user
bun db:migrate          # Run database migrations
bun db:generate         # Generate Prisma client
```

### Frontend
```bash
npm run dev            # Start development server
npm run build          # Build for production
npm run start          # Start production server
```

## 🔒 Security Features

✅ **Server-side authentication** - No credentials exposed to client
✅ **JWT tokens** - Secure, stateless authentication
✅ **Password hashing** - bcrypt with salt rounds
✅ **Session management** - Token expiration and cleanup
✅ **Route protection** - All sensitive endpoints protected
✅ **Error handling** - Secure error messages
✅ **CORS configured** - Controlled cross-origin access

## 🚨 Security Notes

1. **JWT_SECRET**: Must be a strong, random string (256+ bits)
2. **HTTPS**: Use HTTPS in production
3. **Password Policy**: Implement strong password requirements
4. **Rate Limiting**: Consider adding rate limiting for auth endpoints
5. **Token Refresh**: Consider implementing refresh tokens for longer sessions

## 🔄 Migration from Old System

The old client-side authentication has been completely replaced. Users will need to:

1. Clear browser localStorage (old auth tokens)
2. Login with new backend credentials
3. All API calls now go through the secure backend

## 📞 Support

If you encounter issues:

1. Check browser console for errors
2. Verify backend is running on correct port
3. Ensure database is connected and migrated
4. Check JWT_SECRET is set in backend environment
5. Verify NEXT_PUBLIC_API_URL matches backend URL

---

**✅ Your Wallet Watcher application is now secured with proper server-side authentication!**