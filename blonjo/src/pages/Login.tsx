import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { fetchClient, ApiError } from '../api/client';
import { useAuthStore } from '../store/auth';
import { ModeToggle } from '../components/theme-toggle';
import { LanguageToggle } from '../components/lang-toggle';
import { useTranslation } from 'react-i18next';

export default function Login() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { t } = useTranslation();

  // Define schema inside component so we can use the translation hook
  const loginSchema = z.object({
    email: z.string().email({ message: t('invalid_email') }),
    password: z.string().min(6, { message: t('password_min') }),
  });

  type LoginFormValues = z.infer<typeof loginSchema>;

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormValues) => {
    setErrorMsg(null);
    try {
      const formData = new FormData();
      formData.append('username', data.email);
      formData.append('password', data.password);

      const tokenResponse = await fetchClient('/auth/login', {
        method: 'POST',
        body: formData,
      });

      useAuthStore.getState().setAuth(tokenResponse.access_token, {
        id: 0, 
        email: data.email,
        full_name: null,
        role: tokenResponse.role,
        preferred_language: tokenResponse.preferred_language,
      });

      const userResponse = await fetchClient('/auth/me');
      setAuth(tokenResponse.access_token, userResponse);
      navigate('/');
    } catch (error) {
      if (error instanceof ApiError) {
        setErrorMsg(error.message); // Typically backend translated or simple message
      } else {
        setErrorMsg(t('unexpected_error'));
      }
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 relative">
      <div className="absolute top-4 right-4 flex items-center space-x-2">
        <LanguageToggle />
        <ModeToggle />
      </div>
      <div className="w-full max-w-md bg-card text-card-foreground rounded-2xl shadow-xl border border-border/50 p-8 sm:p-10">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold tracking-tight">{t('login_title')}</h1>
          <p className="text-sm text-muted-foreground mt-2">{t('login_subtitle')}</p>
        </div>

        {errorMsg && (
          <div className="mb-6 p-4 bg-destructive/10 text-destructive text-sm font-medium rounded-lg border border-destructive/20">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-semibold leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
              {t('email_label')}
            </label>
            <input
              type="email"
              {...register('email')}
              className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-shadow"
              placeholder="admin@blonjo.com"
            />
            {errors.email && (
              <p className="text-sm font-medium text-destructive mt-1">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
              {t('password_label')}
            </label>
            <input
              type="password"
              {...register('password')}
              className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-shadow"
              placeholder="••••••••"
            />
            {errors.password && (
              <p className="text-sm font-medium text-destructive mt-1">{errors.password.message}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center justify-center rounded-md text-sm font-semibold ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-11 px-4 py-2 w-full mt-2"
          >
            {isSubmitting ? t('signing_in') : t('sign_in_button')}
          </button>
        </form>
      </div>
    </div>
  );
}
