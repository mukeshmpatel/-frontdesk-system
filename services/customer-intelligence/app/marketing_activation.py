import asyncio
from datetime import datetime, timezone
from typing import Any
import httpx
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential
from .config import get_settings


class ConnectorConfigurationError(RuntimeError):
    pass


class RetriableConnectorError(RuntimeError):
    pass


def _require_consent(profile: dict[str, Any]) -> None:
    if profile.get("suppressed") or not profile.get("consent_marketing"):
        raise PermissionError("Customer is suppressed or has not granted marketing consent.")


@retry(retry=retry_if_exception_type(RetriableConnectorError), wait=wait_exponential(min=1, max=20), stop=stop_after_attempt(4))
async def push_to_meta_capi(customer_profile: dict[str, Any], behavior_event: dict[str, Any]) -> dict:
    _require_consent(customer_profile)
    settings = get_settings()
    if not settings.meta_pixel_id or not settings.meta_access_token:
        raise ConnectorConfigurationError("Meta Pixel ID and Conversions API token are required.")
    payload = {
        "data": [{
            "event_name": behavior_event["event_name"],
            "event_time": int(datetime.now(timezone.utc).timestamp()),
            "event_id": behavior_event["event_id"],
            "action_source": "website",
            "event_source_url": behavior_event.get("page_url"),
            "user_data": {
                **({"em": [customer_profile["email_sha256"]]} if customer_profile.get("email_sha256") else {}),
                **({"ph": [customer_profile["phone_sha256"]]} if customer_profile.get("phone_sha256") else {}),
                "external_id": [customer_profile["customer_sha256"]],
            },
            "custom_data": {
                "currency": behavior_event.get("currency", "USD"),
                "value": behavior_event.get("value", 0),
                "cohort_tags": customer_profile.get("cohort_tags", []),
            },
        }],
        "access_token": settings.meta_access_token,
    }
    if settings.activation_mode != "LIVE":
        return {"status": "DRY_RUN", "endpoint": "META_CAPI", "events_received": 0, "payload": payload["data"][0]}
    url = f"https://graph.facebook.com/{settings.meta_api_version}/{settings.meta_pixel_id}/events"
    async with httpx.AsyncClient(timeout=settings.request_timeout_seconds) as client:
        response = await client.post(url, json=payload)
    if response.status_code == 429 or response.status_code >= 500:
        raise RetriableConnectorError(f"Meta temporary failure: HTTP {response.status_code}")
    response.raise_for_status()
    return {"status": "DELIVERED", "provider_response": response.json()}


def _google_credentials(settings):
    from google.oauth2.credentials import Credentials
    return Credentials(
        token=None,
        refresh_token=settings.google_ads_refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.google_ads_client_id,
        client_secret=settings.google_ads_client_secret,
    )


async def sync_google_audience(customer_profile: dict[str, Any], tier_tag: str, remove: bool = False) -> dict:
    _require_consent(customer_profile)
    settings = get_settings()
    required = [
        settings.google_ads_developer_token, settings.google_ads_customer_id,
        settings.google_ads_user_list_resource, settings.google_ads_refresh_token,
        settings.google_ads_client_id, settings.google_ads_client_secret,
    ]
    if not all(required) or not customer_profile.get("email_sha256"):
        raise ConnectorConfigurationError("Complete Google Ads OAuth, developer token, customer ID, user list, and hashed email are required.")
    if settings.activation_mode != "LIVE":
        return {"status": "DRY_RUN", "endpoint": "GOOGLE_CUSTOMER_MATCH", "tier_tag": tier_tag, "remove": remove}

    def run_job() -> dict:
        from google.ads.googleads.client import GoogleAdsClient
        client = GoogleAdsClient({
            "developer_token": settings.google_ads_developer_token,
            "login_customer_id": settings.google_ads_login_customer_id,
            "use_proto_plus": True,
            "credentials": _google_credentials(settings),
        })
        job_service = client.get_service("OfflineUserDataJobService")
        operation = client.get_type("OfflineUserDataJobOperation")
        user_identifier = client.get_type("UserIdentifier")
        user_identifier.hashed_email = customer_profile["email_sha256"]
        user_data = client.get_type("UserData")
        user_data.user_identifiers.append(user_identifier)
        operation.remove.CopyFrom(user_data) if remove else operation.create.CopyFrom(user_data)
        job = client.get_type("OfflineUserDataJob")
        job.type_ = client.enums.OfflineUserDataJobTypeEnum.CUSTOMER_MATCH_USER_LIST
        job.customer_match_user_list_metadata.user_list = settings.google_ads_user_list_resource
        created = job_service.create_offline_user_data_job(customer_id=settings.google_ads_customer_id, job=job)
        job_service.add_offline_user_data_job_operations(
            resource_name=created.resource_name, operations=[operation], enable_partial_failure=True
        )
        job_service.run_offline_user_data_job(resource_name=created.resource_name)
        return {"status": "SUBMITTED", "job_resource": created.resource_name, "tier_tag": tier_tag}

    return await asyncio.to_thread(run_job)


@retry(retry=retry_if_exception_type(RetriableConnectorError), wait=wait_exponential(min=1, max=20), stop=stop_after_attempt(4))
async def trigger_loyalty_invitation(customer_profile: dict[str, Any], discount_code: str) -> dict:
    _require_consent(customer_profile)
    settings = get_settings()
    if not all([settings.sendgrid_api_key, settings.sendgrid_from_email, settings.sendgrid_loyalty_template_id]):
        raise ConnectorConfigurationError("SendGrid API key, verified sender, and loyalty template ID are required.")
    if not customer_profile.get("email"):
        raise ConnectorConfigurationError("A decryptable customer email is required for transactional delivery.")
    request = {
        "personalizations": [{
            "to": [{"email": customer_profile["email"]}],
            "dynamic_template_data": {"discount_code": discount_code, "restaurant_spend": customer_profile["total_restaurant_spend"]},
        }],
        "from": {"email": settings.sendgrid_from_email, "name": "AAIQ Hospitality"},
        "template_id": settings.sendgrid_loyalty_template_id,
    }
    if settings.sendgrid_suppression_group_id:
        request["asm"] = {"group_id": settings.sendgrid_suppression_group_id}
    if settings.activation_mode != "LIVE":
        return {"status": "DRY_RUN", "endpoint": "SENDGRID_MAIL_SEND", "discount_code": discount_code}
    async with httpx.AsyncClient(timeout=settings.request_timeout_seconds) as client:
        response = await client.post(
            "https://api.sendgrid.com/v3/mail/send",
            headers={"Authorization": f"Bearer {settings.sendgrid_api_key}"},
            json=request,
        )
    if response.status_code == 429 or response.status_code >= 500:
        raise RetriableConnectorError(f"SendGrid temporary failure: HTTP {response.status_code}")
    response.raise_for_status()
    return {"status": "DELIVERED", "http_status": response.status_code}
