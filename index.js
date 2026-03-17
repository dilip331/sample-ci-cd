import {
  ConnectClient,
  GetContactMetricsCommand,
  GetCurrentMetricDataCommand
} from "@aws-sdk/client-connect";

const client = new ConnectClient({});

export const handler = async (event) => {
  try {
    console.log("Received Event:", JSON.stringify(event, null, 2));

    const contactId = event?.Details?.ContactData?.ContactId;
    const instanceArn = event?.Details?.ContactData?.InstanceARN;
    const queueArn = event?.Details?.ContactData?.Queue?.ARN;
    const action = event?.Details?.Parameters?.action;

    if (!instanceArn) {
      throw new Error("Missing InstanceARN from Connect event");
    }

    if (!action) {
      throw new Error("Missing action parameter");
    }

    // Extract InstanceId and QueueId from ARNs
    const instanceId = instanceArn.split("/")[1];
    const queueId = queueArn?.split("/").pop();

    console.log("InstanceId:", instanceId);
    console.log("ContactId:", contactId);
    console.log("QueueId:", queueId);
    console.log("QueueArn:", queueArn);
    console.log("Action:", action);

    let metricValue = 0;

    if (action === "getPositionInQueue") {
      // Use GetContactMetricsCommand for individual contact position
      if (!contactId) {
        throw new Error("Missing ContactId from Connect event");
      }

      if (!queueArn) {
        console.log("Contact is not in a queue yet");
        return {
          positionInQueue: 0,
          message: "Contact not in queue"
        };
      }

      const contactCommand = new GetContactMetricsCommand({
        InstanceId: instanceId,
        ContactId: contactId,
        Metrics: [
          {
            Name: "POSITION_IN_QUEUE",
          },
        ],
      });

      const contactResponse = await client.send(contactCommand);
      console.log("GetContactMetrics Response:", JSON.stringify(contactResponse, null, 2));

      if (contactResponse?.MetricResults && contactResponse.MetricResults.length > 0) {
        const metric = contactResponse.MetricResults.find(
          (m) => m.Name === "POSITION_IN_QUEUE"
        );

        if (metric?.Value?.Number !== undefined && metric.Value.Number !== null) {
          metricValue = metric.Value.Number;
        } else {
          console.log("POSITION_IN_QUEUE metric found but no value");
        }
      } else {
        console.log("No MetricResults - contact may not be in queue or metrics not available");
      }

      console.log("Position in Queue:", metricValue);

      return {
        positionInQueue: Math.round(metricValue)
      };

    } else if (action === "getEWT") {
      // Use GetCurrentMetricDataCommand for estimated wait time (queue-level)
      if (!queueId) {
        console.log("No queue specified");
        return {
          estimatedWaitTime: 0,
          message: "No queue specified"
        };
      }

      const currentMetricsCommand = new GetCurrentMetricDataCommand({
        InstanceId: instanceId,
        Filters: {
          Queues: [queueId],
          Channels: ["VOICE"]
        },
        Groupings: ["QUEUE", "CHANNEL"],
        CurrentMetrics: [
          {
            Name: "ESTIMATED_WAIT_TIME",
            Unit: "SECONDS"
          }
        ]
      });

      const currentMetricsResponse = await client.send(currentMetricsCommand);
      console.log("GetCurrentMetricData Response:", JSON.stringify(currentMetricsResponse, null, 2));

      if (currentMetricsResponse?.MetricResults && currentMetricsResponse.MetricResults.length > 0) {
        console.log(`Found ${currentMetricsResponse.MetricResults.length} metric results`);

        const metricResult = currentMetricsResponse.MetricResults[0];
        console.log("First MetricResult:", JSON.stringify(metricResult, null, 2));

        if (metricResult?.Collections && metricResult.Collections.length > 0) {
          console.log(`Found ${metricResult.Collections.length} collections`);

          for (const collection of metricResult.Collections) {
            const metricName = collection?.Metric?.Name;
            const value = collection?.Value;

            console.log(`Metric Name: ${metricName}, Value: ${value}`);

            if (metricName === "ESTIMATED_WAIT_TIME") {
              metricValue = value ?? 0;
              break;
            }
          }
        } else {
          console.log("No Collections found in MetricResult");
        }
      } else {
        console.log("No MetricResults found in response");
      }

      console.log("Estimated Wait Time (seconds):", metricValue);

      return {
        estimatedWaitTime: metricValue // EWT in seconds, rounded
      };

    } else {
      throw new Error(`Invalid action: ${action}. Expected 'getPositionInQueue' or 'getEWT'`);
    }

  } catch (error) {
    console.error("Error", error);

    return {
      positionInQueue: 0,
      estimatedWaitTime: 0,
      error: error.message
    };
  }
};