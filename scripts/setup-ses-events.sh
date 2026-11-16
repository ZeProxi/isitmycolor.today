#!/usr/bin/env bash
# One-time AWS setup for bounce/complaint handling. Idempotent. Needs the AWS CLI
# signed in to the account that owns the SES identity. Usage:
#   SITE_URL=https://isitmycolor.today SSM_PREFIX=/isitmycolor DOMAIN=isitmycolor.today bash scripts/setup-ses-events.sh
set -euo pipefail
export MSYS_NO_PATHCONV=1
REGION="${AWS_DEFAULT_REGION:-us-west-2}"
NAME="${CONFIG_SET:-isitmycolor}"
TOPIC_NAME="${TOPIC_NAME:-isitmycolor-ses-events}"
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)

TOPIC_ARN=$(aws sns create-topic --name "$TOPIC_NAME" --region "$REGION" --query TopicArn --output text)
echo "topic: $TOPIC_ARN"
aws sns set-topic-attributes --region "$REGION" --topic-arn "$TOPIC_ARN" --attribute-name Policy --attribute-value "{
  \"Version\":\"2012-10-17\",
  \"Statement\":[
    {\"Sid\":\"owner\",\"Effect\":\"Allow\",\"Principal\":{\"AWS\":\"arn:aws:iam::$ACCOUNT:root\"},\"Action\":\"SNS:*\",\"Resource\":\"$TOPIC_ARN\"},
    {\"Sid\":\"ses\",\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"ses.amazonaws.com\"},\"Action\":\"SNS:Publish\",\"Resource\":\"$TOPIC_ARN\",
     \"Condition\":{\"StringEquals\":{\"AWS:SourceAccount\":\"$ACCOUNT\"}}}
  ]}"

aws sesv2 get-configuration-set --configuration-set-name "$NAME" --region "$REGION" >/dev/null 2>&1 \
  || aws sesv2 create-configuration-set --configuration-set-name "$NAME" --region "$REGION"
aws sesv2 get-configuration-set-event-destinations --configuration-set-name "$NAME" --region "$REGION" --query "EventDestinations[?Name=='sns-bounces'].Name" --output text | grep -q sns-bounces \
  || aws sesv2 create-configuration-set-event-destination --configuration-set-name "$NAME" --region "$REGION" --event-destination-name sns-bounces \
       --event-destination "{\"Enabled\":true,\"MatchingEventTypes\":[\"BOUNCE\",\"COMPLAINT\"],\"SnsDestination\":{\"TopicArn\":\"$TOPIC_ARN\"}}"
echo "configuration set: $NAME (bounce + complaint -> SNS)"

# Every email from the domain uses it, even one sent without the attribute.
aws sesv2 put-email-identity-configuration-set-attributes --email-identity "$DOMAIN" --configuration-set-name "$NAME" --region "$REGION"

aws ssm put-parameter --region "$REGION" --name "$SSM_PREFIX/SES_CONFIGURATION_SET" --value "$NAME" --type String --overwrite >/dev/null
aws ssm put-parameter --region "$REGION" --name "$SSM_PREFIX/SES_EVENTS_TOPIC_ARN" --value "$TOPIC_ARN" --type String --overwrite >/dev/null
echo "ssm: SES_CONFIGURATION_SET, SES_EVENTS_TOPIC_ARN"

# The site must be deployed with SES_EVENTS_TOPIC_ARN before this: SNS sends a
# confirmation the endpoint has to answer.
ENDPOINT="$SITE_URL/api/ses/events"
aws sns list-subscriptions-by-topic --region "$REGION" --topic-arn "$TOPIC_ARN" --query "Subscriptions[?Endpoint=='$ENDPOINT'].SubscriptionArn" --output text | grep -q arn \
  || aws sns subscribe --region "$REGION" --topic-arn "$TOPIC_ARN" --protocol https --notification-endpoint "$ENDPOINT" >/dev/null
echo "subscription: $ENDPOINT ($(aws sns list-subscriptions-by-topic --region "$REGION" --topic-arn "$TOPIC_ARN" --query "Subscriptions[?Endpoint=='$ENDPOINT'].SubscriptionArn" --output text))"
