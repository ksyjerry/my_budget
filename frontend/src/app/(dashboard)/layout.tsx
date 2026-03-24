"use client";

import Header from "@/components/layout/Header";
import AuthGuard from "@/components/layout/AuthGuard";
import ChatButton from "@/components/chat/ChatButton";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <Header />
      <main>{children}</main>
      <ChatButton />
    </AuthGuard>
  );
}
