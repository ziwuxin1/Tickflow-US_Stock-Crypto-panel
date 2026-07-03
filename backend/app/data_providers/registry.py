"""Provider registry."""
from __future__ import annotations

from app.data_providers.binance_provider import BinanceProvider
from app.data_providers.tickflow_provider import TickFlowProvider
from app.data_providers.yfinance_provider import YFinanceProvider

_PROVIDERS = {
    "tickflow": TickFlowProvider,
    "binance": BinanceProvider,
    "yfinance": YFinanceProvider,
}


def get_provider(name: str = "tickflow"):
    provider_cls = _PROVIDERS.get((name or "tickflow").lower())
    if provider_cls is None:
        raise ValueError(f"Unsupported data provider: {name}")
    return provider_cls()
