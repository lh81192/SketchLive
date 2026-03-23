"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface DialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
}

const Dialog: React.FC<DialogProps> = ({ open, onOpenChange, children }) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => onOpenChange?.(false)}
      />
      {/* Content */}
      <div className="fixed inset-0 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          {children}
        </div>
      </div>
    </div>
  );
};

interface DialogContentProps {
  className?: string;
  children?: React.ReactNode;
}

const DialogContent: React.FC<DialogContentProps> = ({ className, children }) => {
  return (
    <div
      className={cn(
        "relative bg-white rounded-lg shadow-xl w-full max-h-[90vh] overflow-y-auto",
        className
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
};

interface DialogHeaderProps {
  className?: string;
  children?: React.ReactNode;
}

const DialogHeader: React.FC<DialogHeaderProps> = ({ className, children }) => {
  return (
    <div className={cn("px-6 py-4 border-b", className)}>
      {children}
    </div>
  );
};

interface DialogTitleProps {
  className?: string;
  children?: React.ReactNode;
}

const DialogTitle: React.FC<DialogTitleProps> = ({ className, children }) => {
  return (
    <h2 className={cn("text-lg font-semibold", className)}>
      {children}
    </h2>
  );
};

interface DialogDescriptionProps {
  className?: string;
  children?: React.ReactNode;
}

const DialogDescription: React.FC<DialogDescriptionProps> = ({ className, children }) => {
  return (
    <p className={cn("text-sm text-gray-500", className)}>
      {children}
    </p>
  );
};

interface DialogFooterProps {
  className?: string;
  children?: React.ReactNode;
}

const DialogFooter: React.FC<DialogFooterProps> = ({ className, children }) => {
  return (
    <div className={cn("px-6 py-4 border-t bg-gray-50", className)}>
      {children}
    </div>
  );
};

export {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
};
