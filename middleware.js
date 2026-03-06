import { NextResponse } from 'next/server';

// Basic list of known aggressive bots
const BANNED_BOTS = [
    'petalbot',
    'dotbot',
    'mj12bot',
    'ahrefsbot',
    'semrushbot',
    'rogerbot',
    'exabot',
    'grapeshot',
    'statdom',
    'spbot',
];

export function middleware(request) {
    const userAgent = request.headers.get('user-agent')?.toLowerCase() || '';

    // 1. Block known aggressive bots
    if (BANNED_BOTS.some(bot => userAgent.includes(bot))) {
        return new NextResponse('Access Denied', { status: 403 });
    }

    // 2. Prevent automated probing of non-existent sensitive files
    const { pathname } = request.nextUrl;
    if (pathname.includes('.env') || pathname.includes('.git') || pathname.includes('.php')) {
        return new NextResponse('Access Denied', { status: 403 });
    }

    return NextResponse.next();
}

// Only run on non-static assets to save execution time
export const config = {
    matcher: '/((?!_next/static|_next/image|favicon.ico).*)',
};
