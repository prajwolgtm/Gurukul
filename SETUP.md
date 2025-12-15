# MongoDB Setup Instructions

## Environment Variables Setup

Create a `.env` file in the `backend/` directory with the following content:

```env
# MongoDB Connection
MONGO_URI=mongodb+srv://gurukul:gurukul@cluster0.e4wllgg.mongodb.net/gurukul?retryWrites=true&w=majority

# Server Configuration
PORT=5000
NODE_ENV=development

# JWT Secret (CHANGE THIS IN PRODUCTION!)
# Generate a secure random string using:
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_SECRET=your_super_secret_jwt_key_change_this_in_production_use_long_random_string

# CORS Configuration
CORS_ORIGIN=http://localhost:3000
```

## Security Notes

⚠️ **IMPORTANT:**
1. Never commit the `.env` file to git (it's already in .gitignore)
2. Change the JWT_SECRET to a strong random string in production
3. Use environment variables for all sensitive data
4. The MongoDB password shown here should be changed if this is a production database

## Generating a Secure JWT Secret

Run this command to generate a secure JWT secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Testing the Connection

After creating the `.env` file, start your server:
```bash
cd backend
npm start
```

You should see:
```
🗄️  MongoDB connected successfully: cluster0-shard-00-00.e4wllgg.mongodb.net
🚀 Server is running on port 5000
```

