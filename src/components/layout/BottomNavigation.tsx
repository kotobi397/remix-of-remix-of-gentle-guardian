import React, { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { IconGear, IconTrophy } from '@/components/icons/KotobiIcons';
import HomeIcon from '@/components/icons/HomeIcon';
import UploadBookIcon from '@/components/icons/UploadBookIcon';
import QuoteIcon from '@/components/icons/QuoteIcon';
import ProfileIcon from '@/components/icons/ProfileIcon';
import MyBooksIcon from '@/components/icons/MyBooksIcon';
import BookRequestIcon from '@/components/icons/BookRequestIcon';


import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';

const BottomNavigation: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminCheckLoading, setAdminCheckLoading] = useState(false);
  const { user } = useAuth();

  const isActive = (path: string) => {
    if (location.pathname === path) return true;
    // When unauthenticated users are redirected to /auth (e.g. from /my-books,
    // /favorites, /profile), keep the "حسابي" tab highlighted instead of falling
    // back to the home tab.
    if (path === '/profile' && /^\/auth(\/|$|\?)/.test(location.pathname)) return true;
    return false;
  };

  useEffect(() => {
    const checkAdminStatus = async () => {
      if (!user?.email) return setIsAdmin(false);
      try {
        setAdminCheckLoading(true);
        const { data } = await supabase.rpc('is_admin_user', { user_email: user.email });
        setIsAdmin(!!data);
      } catch (error) {
        console.error(error);
        setIsAdmin(false);
      } finally {
        setAdminCheckLoading(false);
      }
    };
    checkAdminStatus();
  }, [user?.email]);

  const handleNavigation = (path: string) => {
    navigate(path);
  };

  const items = [
    { key: 'home', label: 'الرئيسية', icon: <HomeIcon className="h-[22px] w-[22px]" />, path: '/' },
    { key: 'upload', label: 'انشر', icon: <UploadBookIcon className="h-[22px] w-[22px]" />, path: '/upload-book' },
    ...(user && !adminCheckLoading && isAdmin
      ? [{ key: 'admin', label: 'إدارة', icon: <IconGear className="h-[22px] w-[22px]" />, path: '/admin/books' }]
      : []),
    { key: 'quotes', label: 'اقتباسات', icon: <QuoteIcon className="h-[22px] w-[22px]" />, path: '/quotes' },
    { key: 'requests', label: 'اطلب كتاباً', icon: <BookRequestIcon className="h-[22px] w-[22px]" />, path: '/book-requests' },
    { key: 'rewards', label: 'مكافآت', icon: <IconTrophy className="h-[22px] w-[22px]" />, path: '/rewards' },

    { key: 'mybooks', label: 'كتبي', icon: <MyBooksIcon className="h-[22px] w-[22px]" />, path: '/my-books' },
    { key: 'profile', label: 'حسابي', icon: <ProfileIcon className="h-[22px] w-[22px]" />, path: '/profile' },
  ];

  const activeIndex = items.findIndex(i => isActive(i.path));
  const hasActive = activeIndex >= 0;

  const containerRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [pill, setPill] = useState<{ x: number; width: number }>({ x: 0, width: 0 });

  const updatePill = useCallback(() => {
    const container = containerRef.current;
    if (!hasActive) return;
    const btn = btnRefs.current[activeIndex];
    if (!container || !btn) return;
    // نستخدم offsetLeft/offsetWidth (إحداثيات التخطيط) بدلاً من
    // getBoundingClientRect لأنها لا تتأثر بخاصية zoom المطبقة على الجوال
    if (btn.offsetWidth > 0) setPill({ x: btn.offsetLeft, width: btn.offsetWidth });
  }, [activeIndex, hasActive]);

  useLayoutEffect(() => {
    updatePill();
  }, [updatePill]);

  useEffect(() => {
    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(updatePill);
    };
    window.addEventListener('resize', onResize, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, [updatePill]);

  return (
    <div
      data-bottom-navigation="true"
      className="mobile-bottom-navigation fixed inset-x-0 bottom-0 z-[9999] px-3 pb-3 pt-2 md:hidden pointer-events-none"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)' }}
    >
      <div className="liquid-nav relative mx-auto w-full max-w-[650px] overflow-hidden rounded-2xl border-2 border-primary/45 shadow-[0_4px_0_hsl(var(--primary)/0.35),0_12px_28px_-14px_hsl(var(--primary)/0.6)] pointer-events-auto"
        style={{
          background: 'hsl(var(--card))',
          padding: '8px 12px',
          contain: 'layout paint',
        }}
      >
        <div ref={containerRef} className="relative z-[4] flex w-full items-center justify-between gap-1.5">
          {/* active pill */}
          <div
            aria-hidden
            className="absolute rounded-xl bg-primary border-2 border-primary-foreground/20"
            style={{
              top: 6,
              bottom: 6,
              left: 0,
              width: pill.width,
              transform: `translate3d(${pill.x}px, 0, 0)`,
              boxShadow: '0 4px 12px hsl(var(--primary) / 0.35)',
              transition: 'transform 280ms cubic-bezier(0.2, 0.85, 0.35, 1), width 200ms ease',
              willChange: 'transform',
              opacity: pill.width ? 1 : 0,
            }}
          />

          {items.map((item, idx) => {
            const active = hasActive && idx === activeIndex;
            return (
              <button
                key={item.key}
                ref={(el) => (btnRefs.current[idx] = el)}
                onClick={() => handleNavigation(item.path)}
                aria-label={item.label}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative z-[15] flex min-w-0 flex-1 items-center justify-center rounded-xl py-2.5 transition-transform duration-150 active:scale-[0.97]',
                )}
              >
                <span
                  className={cn(
                    'flex items-center justify-center gap-1.5 text-[12px] font-extrabold',
                    active ? 'text-primary-foreground' : 'text-primary',
                  )}
                >
                  <span>{item.icon}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default BottomNavigation;