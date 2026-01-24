'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Menu, X, Briefcase, Building2, FileText, Globe } from 'lucide-react';

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const toggleMenu = () => setIsMenuOpen(!isMenuOpen);
  const closeMenu = () => setIsMenuOpen(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-neutral-950/80 backdrop-blur-lg border-b border-neutral-800/50">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5" onClick={closeMenu}>
            <Image
              src="/joblinca-logo.png"
              alt="Joblinca"
              width={36}
              height={36}
              priority
              className="rounded-lg"
            />
            <span className="font-bold text-lg text-white">Joblinca</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-1">
            <Link
              href="/jobs"
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-neutral-300 hover:text-white hover:bg-neutral-800/50 rounded-lg transition-colors"
            >
              <Briefcase className="w-4 h-4" />
              Find Jobs
            </Link>
            <Link
              href="/remote-jobs"
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-neutral-300 hover:text-white hover:bg-neutral-800/50 rounded-lg transition-colors"
            >
              <Globe className="w-4 h-4" />
              Remote Jobs
            </Link>
            <Link
              href="/cv-builder"
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-neutral-300 hover:text-white hover:bg-neutral-800/50 rounded-lg transition-colors"
            >
              <FileText className="w-4 h-4" />
              CV Builder
            </Link>
            <Link
              href="/recruiter/post-job"
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-neutral-300 hover:text-white hover:bg-neutral-800/50 rounded-lg transition-colors"
            >
              <Building2 className="w-4 h-4" />
              For Recruiters
            </Link>
          </div>

          {/* Auth Actions */}
          <div className="hidden md:flex items-center gap-3">
            <Link
              href="/auth/login"
              className="px-4 py-2 text-sm font-medium text-neutral-300 hover:text-white transition-colors"
            >
              Log In
            </Link>
            <Link
              href="/auth/register?role=candidate"
              className="px-5 py-2.5 text-sm font-semibold bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-all hover:shadow-lg hover:shadow-primary-600/20"
            >
              Get Started
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            type="button"
            onClick={toggleMenu}
            className="md:hidden p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors"
            aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={isMenuOpen}
          >
            {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </nav>

      {/* Mobile Navigation */}
      <div
        className={`md:hidden overflow-hidden transition-all duration-300 ease-in-out ${
          isMenuOpen ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="px-4 py-4 space-y-1 border-t border-neutral-800 bg-neutral-950">
          <Link
            href="/jobs"
            onClick={closeMenu}
            className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-neutral-300 hover:text-white hover:bg-neutral-800/50 rounded-lg transition-colors"
          >
            <Briefcase className="w-5 h-5" />
            Find Jobs
          </Link>
          <Link
            href="/remote-jobs"
            onClick={closeMenu}
            className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-neutral-300 hover:text-white hover:bg-neutral-800/50 rounded-lg transition-colors"
          >
            <Globe className="w-5 h-5" />
            Remote Jobs
          </Link>
          <Link
            href="/cv-builder"
            onClick={closeMenu}
            className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-neutral-300 hover:text-white hover:bg-neutral-800/50 rounded-lg transition-colors"
          >
            <FileText className="w-5 h-5" />
            CV Builder
          </Link>
          <Link
            href="/recruiter/post-job"
            onClick={closeMenu}
            className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-neutral-300 hover:text-white hover:bg-neutral-800/50 rounded-lg transition-colors"
          >
            <Building2 className="w-5 h-5" />
            For Recruiters
          </Link>

          <div className="pt-4 mt-4 border-t border-neutral-800 space-y-2">
            <Link
              href="/auth/login"
              onClick={closeMenu}
              className="block px-4 py-3 text-sm font-medium text-neutral-300 hover:text-white hover:bg-neutral-800/50 rounded-lg transition-colors text-center"
            >
              Log In
            </Link>
            <Link
              href="/auth/register?role=candidate"
              onClick={closeMenu}
              className="block px-4 py-3 text-sm font-semibold bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-all text-center"
            >
              Get Started
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
