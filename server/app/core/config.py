from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    deepgram_api_key: str = ""
    deepl_api_key: str = ""
    openai_api_key: str = ""

    model_config = {"env_file": ".env"}


settings = Settings()
