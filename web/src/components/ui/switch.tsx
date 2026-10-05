"use client";

import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root className={cn("inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-white/20 bg-[#29363d] shadow-inner transition-colors data-[state=checked]:border-[#a592d6]/50 data-[state=checked]:bg-[#605184] disabled:opacity-50", className)} {...props}>
      <SwitchPrimitive.Thumb className="pointer-events-none block size-4 rounded-full bg-[#e0e6e8] shadow-md transition-transform data-[state=unchecked]:translate-x-1 data-[state=checked]:translate-x-6" />
    </SwitchPrimitive.Root>
  );
}
