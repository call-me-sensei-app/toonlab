export const PRESETS: Readonly<{
    /**
     * Scattered fair-weather cumulus under a high midday sun — the startup
     * default, and the frame with the brightest highlight of the eight because the
     * solar aureole sits right at the top edge of shot. This makes the top-centre
     * patch warmer and flatter than the horizon. It is the startup preset.
     */
    partlyCloudy: Readonly<{
        atmosphere: any;
        cloud: any;
        godRays: {};
        nightSky: {};
        noise: {
            weather: {};
        };
        sun: any;
        time: {};
    }>;
    /**
     * Low sun with a broad warm Mie aureole and a deep cumulus deck. The only
     * preset with a red-dominant zenith, and its horizon is warmer still — that
     * ordering is Rayleigh optical depth along a low sun path, not a tint, so the
     * aerosol load is the heaviest of the eight and the sun sits under 5 degrees.
     *
     * The sun stands off to the left of frame rather than in it: the reference's
     * disc is a few pixels below the measured band, and a disc inside the band
     * would put the frame maximum at 1.0 against the reference's 0.64.
     */
    stunningSunset: Readonly<{
        atmosphere: any;
        cloud: any;
        godRays: {};
        nightSky: {};
        noise: {
            weather: {};
        };
        sun: any;
        time: {};
    }>;
    /**
     * Heavy overcast with a towering storm deck. Nearly flat and almost neutral:
     * heavy optical depth, with little forward scatter reaching the eye. The
     * exposure is the reference demo's own 0.52x compensation, so the deck has to
     * be dark BEFORE it — dialling exposure further would flatten what structure the
     * frame still has. The two knobs that actually hold it down are the aerial
     * perspective on the cloud image (`fade.hazeDensityScale`, which at the shipped
     * 1.0 washes an opaque deck all the way back to sky colour) and a heavy ambient
     * fill that lifts the underside back off black once the wash is gone.
     */
    thunderstorm: Readonly<{
        atmosphere: any;
        cloud: any;
        godRays: {};
        nightSky: {};
        noise: {
            weather: {};
        };
        sun: any;
        time: {};
    }>;
    /**
     * Tall storm deck under a low warm sun, with thick horizon coverage. The widest
     * tonal spread of the eight — p50 against p95 is a factor of seven — so the deck
     * is BACK-lit: the sun stands nine degrees up on the camera's own bearing, which
     * is what leaves dark bases and brilliantly lit tops instead of a flatly shaded
     * ceiling. The powder term and a high scattering albedo carry the tops; the base
     * shadow keeps the median down.
     *
     * Two honest departures from the reference frame. The separate storm-haze layer
     * is off (`haze.density` 0): it drives off coverage, and on a deck this covered
     * it flattened the very spread this preset exists for. And the sun's own disc is
     * still in shot — the horizon bank thins it but does not bury it, which is the
     * main reason the frame maximum overshoots.
     */
    stormyEvening: Readonly<{
        atmosphere: any;
        cloud: any;
        godRays: {};
        nightSky: {};
        noise: {
            weather: {};
        };
        sun: any;
        time: {};
    }>;
    /**
     * Night sky with a lit moon and dim moonlit clouds. The clock puts the sun
     * 12.8 degrees down, which is past nautical twilight, so the only light in
     * frame is the moon opposite it and the star panorama. `sunBearing` is
     * therefore the moon's bearing plus 180: the moon sits a little left of
     * centre, where the reference has it.
     */
    moonlitNight: Readonly<{
        atmosphere: any;
        cloud: any;
        godRays: {};
        nightSky: {};
        noise: {
            weather: {};
        };
        sun: any;
        time: {};
    }>;
    /**
     * High midday sun over a soft, low-density cumulus deck with crisp billows.
     * The deepest blue of the daylight presets: a low aerosol load, a barely-there
     * Mie halo, and a Rayleigh depth above Earth's so the blue channel saturates
     * well before the horizon and the sky keeps its colour all the way down.
     */
    fluffy: Readonly<{
        atmosphere: any;
        cloud: any;
        godRays: {};
        nightSky: {};
        noise: {
            weather: {};
        };
        sun: any;
        time: {};
    }>;
    /**
     * Thick atmospheric haze under a high sun — a muted, washed-out horizon. It
     * reads as almost no cloud because the deck is thin high cirrus that stays
     * blue-biased, so the look is the washed horizon and the low contrast, not
     * coverage: the zenith is the darkest and bluest of the daylight presets while
     * the horizon is nearly white.
     */
    hazy: Readonly<{
        atmosphere: any;
        cloud: any;
        godRays: {};
        nightSky: {};
        noise: {
            weather: {};
        };
        sun: any;
        time: {};
    }>;
    /**
     * High midday sun over tall, dense, bright-white cumulus with soft rounded
     * storybook edges. The highest median of the eight and, because no sun disc is
     * in frame, a LOWER maximum than `partlyCloudy` — bright dense bodies rather
     * than a blown highlight.
     */
    pixar: Readonly<{
        atmosphere: any;
        cloud: any;
        godRays: {};
        nightSky: {};
        noise: {
            weather: {};
        };
        sun: any;
        time: {};
    }>;
}>;
/** Preset keys, in the order the reference documents them. */
export const PRESET_NAMES: readonly string[];
/** The reference's documented startup default. */
export const DEFAULT_PRESET_NAME: "partlyCloudy";
