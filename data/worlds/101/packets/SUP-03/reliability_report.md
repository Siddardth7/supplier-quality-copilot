> Synthetic document for a demo. Fictional supplier.

# Reliability report

This document records Hammer Industries (SUP-03) reliability-test evidence for Stark Industries Supplier Quality. Setup observations describe test conditions; acceptance observations and their stated results are identified separately. References to buyer limits report the supplied outcomes; buyer requirements remain buyer context in rfq.md.

## 9.1 Burn-in

Recorded result: true. This item is present or demonstrated.

Burn-in duration (setup): Observed: 48 h.

Ambient temperature (setup): Observed: 55 °C.

Rated-load fraction (setup): Observed: 1 fraction.

Burn-in fallout (acceptance): Observed: 0.008383786927934836 fraction. Result: meets buyer limit.

## 9.2 Thermal cycling / HTOL

Recorded result: true. This item is present or demonstrated.

Completed thermal cycles (acceptance): Observed: 592 cycles. Result: meets buyer limit.

Lower temperature (setup): Observed: -20 °C.

Upper temperature (setup): Observed: 85 °C.

Dwell at each extreme (setup): Observed: 15 min.

Functional failures (acceptance): Observed: 0 count. Result: meets buyer limit.

## 9.3 Efficiency vs load

Recorded result: true. This item is present or demonstrated.

Efficiency at low load point (acceptance): Observed: 1 fraction. Result: meets buyer limit.

Low load point / rated load (setup): Observed: 0.2 fraction.

Efficiency at middle load point (acceptance): Observed: 1 fraction. Result: meets buyer limit.

Middle load point / rated load (setup): Observed: 0.5 fraction.

Efficiency at full load point (acceptance): Observed: 1 fraction. Result: meets buyer limit.

Full load point / rated load (setup): Observed: 1 fraction.

Input voltage (setup): Observed: 400 V DC.

Output voltage (setup): Observed: 48 V DC.

## 9.4 HALT

Recorded result: true. This item is present or demonstrated.

Operating-limit margins reported (acceptance): Observed: true boolean. Context: Report cold, hot and vibration margins relative to the declared product operating envelope.. Result: meets buyer limit.

Destruct-limit margins reported (acceptance): Observed: true boolean. Context: Report cold, hot and vibration margins relative to the declared product operating envelope.. Result: meets buyer limit.

## 9.5 Component derating

Recorded result: true. This item is present or demonstrated.

Derating analysis present (acceptance): Observed: true boolean. Context: Stark heuristic policy for all components at worst-case declared load and ambient.. Result: meets buyer limit.

Component applied / rated voltage (acceptance): Observed: 0.6575246390513776 ratio. Result: meets buyer limit.

Component applied / rated current (acceptance): Observed: 0.6656574923941587 ratio. Result: meets buyer limit.

## 9.6 Test instructions and release limits

Recorded result: true. This item is present or demonstrated.

document: Methods and buyer acceptance criteria documented.

## 9.7 Statistical sample-size rationale

Recorded result: true. This item is present or demonstrated.

document: Documented statistical sample-size rationale.
