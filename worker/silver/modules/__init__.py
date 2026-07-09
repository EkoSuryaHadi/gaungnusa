"""Silver modules — independent plugin-based data quality modules.

Each module implements the BaseModule interface:
    run(df: pd.DataFrame, ctx: SilverContext) → Tuple[pd.DataFrame, SilverContext]
"""
