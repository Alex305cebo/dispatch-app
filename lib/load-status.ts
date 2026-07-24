// Auto-advance a load's status from the truck's live GPS: booked → in_transit once the
// truck has LEFT the pickup, in_transit → delivered once it has LEFT the delivery. Pure
// decision here (unit-tested); the DB read/write + geocoding live in app/actions.ts.

export type ActiveStatus = 'booked' | 'in_transit'

/** How close counts as "at" a stop. A truck loads/unloads within a few miles of the dock,
 * and GPS + our city/ZIP geocode fallback both wobble, so a tight radius would miss real
 * arrivals; too wide and a highway passing nearby trips it. 12 mi is the balance. */
export const GEOFENCE_MI = 12

/**
 * Forward-only, and only ever fires AFTER an arrival was recorded — a truck merely driving
 * TOWARD the pickup is also "far from pickup", so distance alone would falsely flip it to
 * in_transit. Requiring "was seen at the stop, now gone" is what makes it a real departure.
 * Returns the new status, or null for no change.
 */
export function nextLoadStatus(args: {
  status: ActiveStatus
  /** Truck's great-circle miles to the pickup / delivery point; null when not geocodable. */
  distToPickupMi: number | null
  distToDeliveryMi: number | null
  /** Whether the truck has already been seen inside the pickup / delivery geofence. */
  pickupArrived: boolean
  deliveryArrived: boolean
  geofenceMi?: number
}): 'in_transit' | 'delivered' | null {
  const gf = args.geofenceMi ?? GEOFENCE_MI
  const { status, distToPickupMi: dP, distToDeliveryMi: dD, pickupArrived, deliveryArrived } = args

  if (status === 'booked') {
    // Loaded and pulled out of the shipper: was at pickup, now beyond the geofence.
    if (pickupArrived && dP != null && dP > gf) return 'in_transit'
    return null
  }
  // in_transit → delivered: reached the consignee and left again.
  if (deliveryArrived && dD != null && dD > gf) return 'delivered'
  return null
}
