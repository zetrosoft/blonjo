import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { useTranslation } from 'react-i18next';
import { Settings as SettingsIcon } from 'lucide-react';
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "../components/ui/breadcrumb";

// Modular Tab Components
import StoreSettings from './settings/StoreSettings';
import UserSettings from './settings/UserSettings';
import RoleSettings from './settings/RoleSettings';
import VoiceSettings from './settings/VoiceSettings';
import AITrainingSettings from './settings/AITrainingSettings';
import SaasSettings from './settings/SaasSettings';

// UI Hub Components (Grid Cards)
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { 
  Store, Users, Shield, Mic2, Wand2, ShieldCheck, ArrowRight 
} from 'lucide-react';

export default function Settings() {
  const { t } = useTranslation();
  const { tab } = useParams<{ tab: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const activeTab = tab as 'store' | 'users' | 'roles' | 'saas' | 'voice' | 'aitraining' | undefined;

  const getTabLabel = (tKey: string) => {
    if (tKey === 'aitraining') return t('setting_ai_training');
    return t(`setting_${tKey}`);
  };

  return (
    <div className="container mx-auto px-6 py-8 space-y-6">
      {/* ── Breadcrumb ── */}
      <Breadcrumb className="mb-2">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink onClick={() => navigate('/')} className="cursor-pointer">
              Dashboard
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          {activeTab ? (
            <>
              <BreadcrumbItem>
                <BreadcrumbLink onClick={() => navigate('/settings')} className="cursor-pointer">
                  {t('menu_settings')}
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{getTabLabel(activeTab)}</BreadcrumbPage>
              </BreadcrumbItem>
            </>
          ) : (
            <BreadcrumbItem>
              <BreadcrumbPage>{t('menu_settings')}</BreadcrumbPage>
            </BreadcrumbItem>
          )}
        </BreadcrumbList>
      </Breadcrumb>

      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between pb-6 border-b border-border/40 gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-foreground tracking-tight flex items-center gap-3">
            <SettingsIcon className="w-8 h-8 text-primary animate-spin-slow" />
            {activeTab ? getTabLabel(activeTab) : t('settings_title')}
          </h1>
          <p className="text-muted-foreground mt-2">
            {activeTab === 'aitraining'
              ? t('setting_ai_training_subtitle')
              : activeTab 
                ? t('settings_subtitle_tab', { tab: getTabLabel(activeTab).toLowerCase() })
                : t('settings_subtitle_main')
            }
          </p>
        </div>
      </div>

      <div className="w-full transition-all duration-300">
        {/* ── Hub Mode (Grid of Cards) ── */}
        {!activeTab && (
          <div className="space-y-8 animate-in fade-in duration-300">
            {/* Hero Banner */}
            <div className="relative overflow-hidden rounded-2xl border border-primary/10 dark:border-primary/20 bg-gradient-to-br from-primary/5 via-transparent to-zinc-500/5 dark:to-zinc-500/10 p-8 shadow-inner">
              <div className="max-w-2xl space-y-4">
                <span className="bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                  {t('settings_control_center')}
                </span>
                <h2 className="text-2xl font-bold text-zinc-950 dark:text-zinc-50">
                  {t('settings_hero_title')}
                </h2>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  {t('settings_hero_desc')}
                </p>
              </div>
              <div className="absolute right-0 bottom-0 w-48 h-48 bg-primary/10 rounded-full filter blur-3xl pointer-events-none" />
            </div>

            {/* Main Settings Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* 1. Store */}
              <Card className="border-zinc-200/80 dark:border-zinc-800/80 bg-card hover:shadow-md transition-all duration-300 flex flex-col group cursor-pointer" onClick={() => navigate('/settings/store')}>
                <CardHeader className="space-y-2 pb-2">
                  <div className="p-3 bg-primary/10 text-primary w-fit rounded-xl">
                    <Store className="w-6 h-6" />
                  </div>
                  <CardTitle className="text-md font-bold mt-2">{t('settings_hub_store_title')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 flex-1 flex flex-col justify-between">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">{t('settings_hub_store_desc')}</p>
                  <Button variant="ghost" className="w-full flex items-center justify-between text-xs font-bold border border-zinc-200 dark:border-zinc-800 mt-4 group-hover:bg-primary group-hover:text-primary-foreground transition-all">
                    <span>{t('setting_store_btn')}</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </CardContent>
              </Card>

              {/* 2. Users */}
              <Card className="border-zinc-200/80 dark:border-zinc-800/80 bg-card hover:shadow-md transition-all duration-300 flex flex-col group cursor-pointer" onClick={() => navigate('/settings/users')}>
                <CardHeader className="space-y-2 pb-2">
                  <div className="p-3 bg-primary/10 text-primary w-fit rounded-xl">
                    <Users className="w-6 h-6" />
                  </div>
                  <CardTitle className="text-md font-bold mt-2">{t('settings_hub_users_title')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 flex-1 flex flex-col justify-between">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">{t('settings_hub_users_desc')}</p>
                  <Button variant="ghost" className="w-full flex items-center justify-between text-xs font-bold border border-zinc-200 dark:border-zinc-800 mt-4 group-hover:bg-primary group-hover:text-primary-foreground transition-all">
                    <span>{t('setting_users_btn')}</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </CardContent>
              </Card>

              {/* 3. Roles */}
              <Card className="border-zinc-200/80 dark:border-zinc-800/80 bg-card hover:shadow-md transition-all duration-300 flex flex-col group cursor-pointer" onClick={() => navigate('/settings/roles')}>
                <CardHeader className="space-y-2 pb-2">
                  <div className="p-3 bg-primary/10 text-primary w-fit rounded-xl">
                    <Shield className="w-6 h-6" />
                  </div>
                  <CardTitle className="text-md font-bold mt-2">{t('settings_hub_roles_title')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 flex-1 flex flex-col justify-between">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">{t('settings_hub_roles_desc')}</p>
                  <Button variant="ghost" className="w-full flex items-center justify-between text-xs font-bold border border-zinc-200 dark:border-zinc-800 mt-4 group-hover:bg-primary group-hover:text-primary-foreground transition-all">
                    <span>{t('setting_roles_btn')}</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </CardContent>
              </Card>

              {/* 4. Voice Rules */}
              <Card className="border-zinc-200/80 dark:border-zinc-800/80 bg-card hover:shadow-md transition-all duration-300 flex flex-col group cursor-pointer" onClick={() => navigate('/settings/voice')}>
                <CardHeader className="space-y-2 pb-2">
                  <div className="p-3 bg-primary/10 text-primary w-fit rounded-xl">
                    <Mic2 className="w-6 h-6" />
                  </div>
                  <CardTitle className="text-md font-bold mt-2">{t('settings_hub_voice_title')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 flex-1 flex flex-col justify-between">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">{t('settings_hub_voice_desc')}</p>
                  <Button variant="ghost" className="w-full flex items-center justify-between text-xs font-bold border border-zinc-200 dark:border-zinc-800 mt-4 group-hover:bg-primary group-hover:text-primary-foreground transition-all">
                    <span>{t('setting_voice_btn')}</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </CardContent>
              </Card>

              {/* 5. AI Training */}
              <Card className="border-zinc-200/80 dark:border-zinc-800/80 bg-card hover:shadow-md transition-all duration-300 flex flex-col group cursor-pointer" onClick={() => navigate('/settings/aitraining')}>
                <CardHeader className="space-y-2 pb-2">
                  <div className="p-3 bg-primary/10 text-primary w-fit rounded-xl">
                    <Wand2 className="w-6 h-6" />
                  </div>
                  <CardTitle className="text-md font-bold mt-2">{t('setting_ai_training')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 flex-1 flex flex-col justify-between">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">{t('ai_training_desc')}</p>
                  <Button variant="ghost" className="w-full flex items-center justify-between text-xs font-bold border border-zinc-200 dark:border-zinc-800 mt-4 group-hover:bg-primary group-hover:text-primary-foreground transition-all">
                    <span>{t('setting_ai_training')}</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </CardContent>
              </Card>

              {/* 6. SaaS Admin (If Superuser) */}
              {user?.is_superuser && (
                <Card className="border-violet-200/80 dark:border-violet-900/40 bg-card hover:shadow-md transition-all duration-300 flex flex-col group cursor-pointer lg:col-span-1" onClick={() => navigate('/settings/saas')}>
                  <CardHeader className="space-y-2 pb-2">
                    <div className="p-3 bg-violet-500/10 text-violet-500 w-fit rounded-xl">
                      <ShieldCheck className="w-6 h-6" />
                    </div>
                    <CardTitle className="text-md font-bold mt-2 text-violet-700 dark:text-violet-400">{t('settings_hub_saas_title')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 flex-1 flex flex-col justify-between">
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">{t('settings_hub_saas_desc')}</p>
                    <Button variant="ghost" className="w-full flex items-center justify-between text-xs font-bold border border-violet-200 dark:border-violet-900/40 text-violet-600 hover:bg-violet-600 hover:text-white mt-4 transition-all">
                      <span>{t('setting_saas_btn')}</span>
                      <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}

        {/* ── Tab Content Rendering ── */}
        {activeTab === 'store' && <StoreSettings />}
        {activeTab === 'users' && <UserSettings />}
        {activeTab === 'roles' && <RoleSettings />}
        {activeTab === 'voice' && <VoiceSettings />}
        {activeTab === 'aitraining' && <AITrainingSettings />}
        {activeTab === 'saas' && user?.is_superuser && <SaasSettings />}
      </div>
    </div>
  );
}
