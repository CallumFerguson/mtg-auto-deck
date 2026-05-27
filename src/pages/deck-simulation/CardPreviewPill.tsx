import { useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

type CardPreviewPillPosition = {
  left: number
  placement: "above" | "below"
  top: number
  width: number
}

const CARD_PREVIEW_PILL_GAP_PX = 8
const CARD_PREVIEW_PILL_MARGIN_PX = 12
const CARD_PREVIEW_PILL_PADDING_PX = 8
const CARD_PREVIEW_PILL_WIDTH_PX = 160
const CARD_PREVIEW_PILL_WIDTH_SM_PX = 192
const CARD_PREVIEW_PILL_IMAGE_HEIGHT_RATIO = 680 / 488

export function CardPreviewPill({
  className = "",
  href,
  imageUrl,
  isFocusable = true,
  isLinkEnabled = true,
  label,
  title,
  variant = "default",
}: {
  className?: string
  href: string | null
  imageUrl?: string | null
  isFocusable?: boolean
  isLinkEnabled?: boolean
  label: string
  title: string
  variant?: "default" | "selected" | "disabled" | "unresolved"
}) {
  const [isPreviewVisible, setIsPreviewVisible] = useState(false)
  const [previewPosition, setPreviewPosition] =
    useState<CardPreviewPillPosition | null>(null)
  const previewTriggerRef = useRef<HTMLSpanElement | null>(null)
  const content = <span className="block truncate">{label}</span>
  const trimmedHref =
    isLinkEnabled && variant !== "disabled" ? href?.trim() || null : null
  const trimmedImageUrl = imageUrl?.trim() || null
  const baseClassName =
    "inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-xs font-medium align-baseline"
  const variantClassName = getCardPreviewPillVariantClassName(variant)
  const pillClassName = `${baseClassName} ${variantClassName} ${className}`

  useLayoutEffect(() => {
    if (!isPreviewVisible || !trimmedImageUrl) {
      return
    }

    function updatePreviewPosition() {
      const triggerElement = previewTriggerRef.current

      if (!triggerElement) {
        setPreviewPosition(null)
        return
      }

      setPreviewPosition(
        getCardPreviewPillPosition(triggerElement.getBoundingClientRect())
      )
    }

    updatePreviewPosition()
    window.addEventListener("resize", updatePreviewPosition)
    window.addEventListener("scroll", updatePreviewPosition, true)

    return () => {
      window.removeEventListener("resize", updatePreviewPosition)
      window.removeEventListener("scroll", updatePreviewPosition, true)
    }
  }, [isPreviewVisible, trimmedImageUrl])

  function hidePreview() {
    setIsPreviewVisible(false)
    setPreviewPosition(null)
  }

  const pill = trimmedHref ? (
    <a
      className={pillClassName}
      href={trimmedHref}
      target="_blank"
      rel="noreferrer"
      title={title}
      onBlur={hidePreview}
      onClick={(event) => {
        hidePreview()
        event.currentTarget.blur()
      }}
      onFocus={() => setIsPreviewVisible(true)}
    >
      {content}
    </a>
  ) : (
    <span
      aria-disabled={variant === "disabled" || variant === "unresolved"}
      className={pillClassName}
      tabIndex={isFocusable && trimmedImageUrl ? 0 : undefined}
      title={title}
      onBlur={hidePreview}
      onFocus={() => setIsPreviewVisible(true)}
    >
      {content}
    </span>
  )

  return (
    <>
      <span
        ref={previewTriggerRef}
        data-card-preview-pill="true"
        className="inline-flex max-w-full align-baseline"
        onMouseEnter={() => setIsPreviewVisible(true)}
        onMouseLeave={hidePreview}
      >
        {pill}
      </span>
      {isPreviewVisible && previewPosition && trimmedImageUrl
        ? createPortal(
            <span
              className={`pointer-events-none fixed z-50 rounded-[5.75%/4.4%] bg-black/80 p-1 shadow-2xl shadow-black/70 ${
                previewPosition.placement === "above"
                  ? "origin-bottom"
                  : "origin-top"
              }`}
              style={{
                left: previewPosition.left,
                top: previewPosition.top,
                width: previewPosition.width,
              }}
              aria-hidden="true"
            >
              <img
                className="block aspect-[488/680] w-full rounded-[4.75%/3.4%] object-cover"
                src={trimmedImageUrl}
                alt=""
                loading="lazy"
              />
            </span>,
            document.body
          )
        : null}
    </>
  )
}

function getCardPreviewPillVariantClassName(
  variant: "default" | "selected" | "disabled" | "unresolved"
) {
  switch (variant) {
    case "selected":
      return "border-sky-300/70 bg-sky-500/20 text-sky-50 shadow-sm shadow-sky-950/30 transition-colors hover:border-sky-200 hover:bg-sky-500/25 focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:outline-none"
    case "disabled":
      return "cursor-not-allowed border-sky-500/10 bg-sky-950/10 text-sky-100/45"
    case "unresolved":
      return "cursor-default border-sky-500/15 bg-sky-950/15 text-sky-100/55"
    case "default":
    default:
      return "border-sky-500/30 bg-sky-950/30 text-sky-100 transition-colors hover:border-sky-300/60 hover:bg-sky-900/40 hover:text-sky-50 focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none"
  }
}

function getCardPreviewPillPosition(
  triggerRect: DOMRect
): CardPreviewPillPosition {
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const previewWidth = window.matchMedia("(min-width: 640px)").matches
    ? CARD_PREVIEW_PILL_WIDTH_SM_PX
    : CARD_PREVIEW_PILL_WIDTH_PX
  const previewContentWidth = previewWidth - CARD_PREVIEW_PILL_PADDING_PX
  const previewHeight =
    previewContentWidth * CARD_PREVIEW_PILL_IMAGE_HEIGHT_RATIO +
    CARD_PREVIEW_PILL_PADDING_PX
  const spaceBelow =
    viewportHeight - triggerRect.bottom - CARD_PREVIEW_PILL_MARGIN_PX
  const spaceAbove = triggerRect.top - CARD_PREVIEW_PILL_MARGIN_PX
  const placement =
    spaceBelow >= previewHeight || spaceBelow >= spaceAbove ? "below" : "above"
  const preferredTop =
    placement === "below"
      ? triggerRect.bottom + CARD_PREVIEW_PILL_GAP_PX
      : triggerRect.top - previewHeight - CARD_PREVIEW_PILL_GAP_PX
  const maxTop = viewportHeight - CARD_PREVIEW_PILL_MARGIN_PX - previewHeight
  const preferredLeft =
    triggerRect.left + triggerRect.width / 2 - previewWidth / 2
  const maxLeft = viewportWidth - CARD_PREVIEW_PILL_MARGIN_PX - previewWidth

  return {
    left: clampCardPreviewPillValue(
      preferredLeft,
      CARD_PREVIEW_PILL_MARGIN_PX,
      maxLeft
    ),
    placement,
    top: clampCardPreviewPillValue(
      preferredTop,
      CARD_PREVIEW_PILL_MARGIN_PX,
      maxTop
    ),
    width: previewWidth,
  }
}

function clampCardPreviewPillValue(value: number, min: number, max: number) {
  if (max < min) {
    return min
  }

  return Math.min(Math.max(value, min), max)
}
