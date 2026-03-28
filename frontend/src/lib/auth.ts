// ─────────────────────────────────────────────────────────
//  AGI-1 — Auth.js v5 Configuration
//  Providers: Google, Apple, Credentials (email/password)
//  Adapter: DynamoDB (AGI1_Auth table)
// ─────────────────────────────────────────────────────────
import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import Apple from 'next-auth/providers/apple';
import Credentials from 'next-auth/providers/credentials';
import { DynamoDBAdapter } from '@auth/dynamodb-adapter';
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { compare } from 'bcryptjs';
import { getItem, Tables } from './dynamodb';

// ── DynamoDB client for Auth adapter ─────────────────────
const dynamoClient = DynamoDBDocument.from(
  new DynamoDB({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials:
      process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          }
        : undefined,
  }),
  {
    marshallOptions: { convertEmptyValues: true, removeUndefinedValues: true, convertClassInstanceToMap: true },
  }
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DynamoDBAdapter(dynamoClient, { tableName: Tables.AUTH }),

  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
    Apple({
      clientId: process.env.AUTH_APPLE_ID!,
      clientSecret: process.env.AUTH_APPLE_SECRET!,
    }),
    Credentials({
      name: 'Email',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const email = (credentials.email as string).trim().toLowerCase();
        const password = credentials.password as string;

        // Look up user profile for password hash
        const profile = await getItem(
          Tables.USER_PROFILES,
          `USER#${email}`,
          'PROFILE'
        );

        if (!profile || !profile.password_hash) return null;

        const valid = await compare(password, profile.password_hash);
        if (!valid) return null;

        return {
          id: profile.user_id || email,
          email,
          name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || email,
        };
      },
    }),
  ],

  session: { strategy: 'jwt' },

  pages: {
    signIn: '/login',
    newUser: '/plans',
    error: '/login',
  },

  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        token.userId = user.id;
        token.provider = account?.provider || 'credentials';
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user && token.userId) {
        (session.user as any).id = token.userId;
        (session.user as any).provider = token.provider;
      }
      return session;
    },

    async signIn({ user, account }) {
      // After OAuth sign-in, check if this is first time
      // Profile will be created in the register flow or onboarding
      return true;
    },
  },

  secret: process.env.AUTH_SECRET,
  trustHost: true,
});
