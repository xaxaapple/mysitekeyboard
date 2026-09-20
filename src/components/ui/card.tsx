import * as React from "react"

import { cn } from "@/lib/utils"
import { useGlassRefraction } from "@/hooks/useGlassRefraction"

type CardProps = React.ComponentProps<"div"> & {
  /**
   * Bend the backdrop along the card's rim (Liquid Glass edge refraction).
   * Costs one displacement filter per card, so use it on a few top-level
   * cards only, never on a card nested inside another.
   */
  refract?: boolean
}

function Card({ className, refract = false, children, ...props }: CardProps) {
  const refractRef = React.useRef<HTMLSpanElement>(null)
  useGlassRefraction(refractRef, { enabled: refract })

  return (
    <div
      data-slot="card"
      className={cn(
        "lg-panel text-card-foreground flex flex-col gap-6 py-6",
        className
      )}
      {...props}
    >
      {refract && <span ref={refractRef} className="lg-refract" aria-hidden="true" />}
      {children}
    </div>
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("leading-none font-semibold", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-6", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-6 [.border-t]:pt-6", className)}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
