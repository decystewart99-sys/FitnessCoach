package io.github.decystewart99sys.coach

import android.content.Intent
import androidx.activity.result.ActivityResult
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.NutritionRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.request.AggregateGroupByPeriodRequest
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.time.Duration
import java.time.LocalDate
import java.time.Period
import java.time.ZoneId
import kotlin.reflect.KClass

/**
 * Read-only bridge to Android Health Connect for the Coach app.
 * Reads food totals (calories + macros, e.g. from MyFitnessPal), weight, steps, resting heart
 * rate, sleep and running sessions (e.g. from Garmin Connect). Nothing is written or sent anywhere.
 */
@CapacitorPlugin(name = "HealthBridge")
class HealthBridgePlugin : Plugin() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    private val readPermissions: Set<String> = setOf(
        HealthPermission.getReadPermission(NutritionRecord::class),
        HealthPermission.getReadPermission(WeightRecord::class),
        HealthPermission.getReadPermission(StepsRecord::class),
        HealthPermission.getReadPermission(RestingHeartRateRecord::class),
        HealthPermission.getReadPermission(SleepSessionRecord::class),
        HealthPermission.getReadPermission(ExerciseSessionRecord::class),
        HealthPermission.getReadPermission(DistanceRecord::class),
        HealthPermission.getReadPermission(HeartRateRecord::class),
    )

    private fun client() = HealthConnectClient.getOrCreate(context)

    private fun perm(type: KClass<out Record>) = HealthPermission.getReadPermission(type)

    private fun permissionResult(granted: Set<String>): JSObject =
        JSObject()
            .put("granted", JSArray(granted.toList()))
            .put("all", granted.containsAll(readPermissions))

    @PluginMethod
    fun availability(call: PluginCall) {
        val status = when (HealthConnectClient.getSdkStatus(context)) {
            HealthConnectClient.SDK_AVAILABLE -> "available"
            HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "update_required"
            else -> "unavailable"
        }
        call.resolve(JSObject().put("status", status))
    }

    @PluginMethod
    fun grantedPermissions(call: PluginCall) {
        scope.launch {
            try {
                call.resolve(permissionResult(client().permissionController.getGrantedPermissions()))
            } catch (e: Exception) {
                call.reject(e.message ?: "Health Connect error")
            }
        }
    }

    @PluginMethod
    fun requestHealthPermissions(call: PluginCall) {
        val intent = PermissionController.createRequestPermissionResultContract().createIntent(context, readPermissions)
        startActivityForResult(call, intent, "onPermissionsResult")
    }

    @ActivityCallback
    private fun onPermissionsResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        val granted = PermissionController.createRequestPermissionResultContract().parseResult(result.resultCode, result.data)
        call.resolve(permissionResult(granted))
    }

    @PluginMethod
    fun openSettings(call: PluginCall) {
        try {
            val intent = Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            call.resolve()
        } catch (e: Exception) {
            call.reject("Couldn't open Health Connect settings")
        }
    }

    private suspend fun <T : Record> readAll(type: KClass<T>, filter: TimeRangeFilter): List<T> {
        val out = mutableListOf<T>()
        var token: String? = null
        do {
            val response = client().readRecords(ReadRecordsRequest(type, filter, pageSize = 1000, pageToken = token))
            out.addAll(response.records)
            token = response.pageToken
        } while (token != null)
        return out
    }

    /**
     * Daily summaries between start and end (inclusive, yyyy-MM-dd, phone's time zone):
     * kcal, proteinG, carbG, fatG, steps, restingHr, weightKg, sleepMin.
     */
    @PluginMethod
    fun readDaily(call: PluginCall) {
        val start = LocalDate.parse(call.getString("start"))
        val end = LocalDate.parse(call.getString("end"))
        scope.launch {
            try {
                val zone = ZoneId.systemDefault()
                val granted = client().permissionController.getGrantedPermissions()
                val days = sortedMapOf<String, JSObject>()
                fun day(d: LocalDate): JSObject = days.getOrPut(d.toString()) { JSObject().put("date", d.toString()) }
                val localRange = TimeRangeFilter.between(start.atStartOfDay(), end.plusDays(1).atStartOfDay())
                val instantRange = TimeRangeFilter.between(start.atStartOfDay(zone).toInstant(), end.plusDays(1).atStartOfDay(zone).toInstant())

                // Food: daily totals (Health Connect de-duplicates overlapping apps by its priority list).
                if (granted.contains(perm(NutritionRecord::class))) {
                    val groups = client().aggregateGroupByPeriod(
                        AggregateGroupByPeriodRequest(
                            metrics = setOf(
                                NutritionRecord.ENERGY_TOTAL,
                                NutritionRecord.PROTEIN_TOTAL,
                                NutritionRecord.TOTAL_CARBOHYDRATE_TOTAL,
                                NutritionRecord.TOTAL_FAT_TOTAL,
                            ),
                            timeRangeFilter = localRange,
                            timeRangeSlicer = Period.ofDays(1),
                        ),
                    )
                    for (g in groups) {
                        val kcal = g.result[NutritionRecord.ENERGY_TOTAL]?.inKilocalories ?: continue
                        if (kcal <= 0) continue
                        val o = day(g.startTime.toLocalDate()).put("kcal", kcal)
                        g.result[NutritionRecord.PROTEIN_TOTAL]?.let { o.put("proteinG", it.inGrams) }
                        g.result[NutritionRecord.TOTAL_CARBOHYDRATE_TOTAL]?.let { o.put("carbG", it.inGrams) }
                        g.result[NutritionRecord.TOTAL_FAT_TOTAL]?.let { o.put("fatG", it.inGrams) }
                    }
                }

                if (granted.contains(perm(StepsRecord::class))) {
                    val groups = client().aggregateGroupByPeriod(
                        AggregateGroupByPeriodRequest(setOf(StepsRecord.COUNT_TOTAL), localRange, Period.ofDays(1)),
                    )
                    for (g in groups) {
                        val steps = g.result[StepsRecord.COUNT_TOTAL] ?: continue
                        if (steps > 0) day(g.startTime.toLocalDate()).put("steps", steps)
                    }
                }

                // Resting HR: last reading of each day.
                if (granted.contains(perm(RestingHeartRateRecord::class))) {
                    for (r in readAll(RestingHeartRateRecord::class, instantRange).sortedBy { it.time }) {
                        day(r.time.atZone(zone).toLocalDate()).put("restingHr", r.beatsPerMinute)
                    }
                }

                // Weight: first (morning) reading of each day.
                if (granted.contains(perm(WeightRecord::class))) {
                    for (r in readAll(WeightRecord::class, instantRange).sortedByDescending { it.time }) {
                        day(r.time.atZone(zone).toLocalDate()).put("weightKg", r.weight.inKilograms)
                    }
                }

                // Sleep: minutes asleep, credited to the day you woke up. Sessions that end after
                // the range are included by widening the read window by a day.
                if (granted.contains(perm(SleepSessionRecord::class))) {
                    val sleepRange = TimeRangeFilter.between(start.minusDays(1).atStartOfDay(zone).toInstant(), end.plusDays(1).atStartOfDay(zone).toInstant())
                    val awake = setOf(
                        SleepSessionRecord.STAGE_TYPE_AWAKE,
                        SleepSessionRecord.STAGE_TYPE_AWAKE_IN_BED,
                        SleepSessionRecord.STAGE_TYPE_OUT_OF_BED,
                    )
                    val minutes = mutableMapOf<LocalDate, Long>()
                    for (s in readAll(SleepSessionRecord::class, sleepRange)) {
                        val wake = s.endTime.atZone(zone).toLocalDate()
                        if (wake.isBefore(start) || wake.isAfter(end)) continue
                        val asleep = if (s.stages.isNotEmpty()) {
                            s.stages.filter { it.stage !in awake }.sumOf { Duration.between(it.startTime, it.endTime).toMinutes() }
                        } else {
                            Duration.between(s.startTime, s.endTime).toMinutes()
                        }
                        minutes[wake] = (minutes[wake] ?: 0L) + asleep
                    }
                    for ((d, m) in minutes) if (m > 0) day(d).put("sleepMin", m)
                }

                call.resolve(JSObject().put("days", JSArray(days.values.toList())))
            } catch (e: Exception) {
                call.reject(e.message ?: "Health Connect error")
            }
        }
    }

    /** Running sessions between start and end (inclusive) with distance and heart rate. */
    @PluginMethod
    fun readRuns(call: PluginCall) {
        val start = LocalDate.parse(call.getString("start"))
        val end = LocalDate.parse(call.getString("end"))
        scope.launch {
            try {
                val zone = ZoneId.systemDefault()
                val granted = client().permissionController.getGrantedPermissions()
                if (!granted.contains(perm(ExerciseSessionRecord::class))) {
                    call.resolve(JSObject().put("runs", JSArray()))
                    return@launch
                }
                val range = TimeRangeFilter.between(start.atStartOfDay(zone).toInstant(), end.plusDays(1).atStartOfDay(zone).toInstant())
                val runTypes = setOf(ExerciseSessionRecord.EXERCISE_TYPE_RUNNING, ExerciseSessionRecord.EXERCISE_TYPE_RUNNING_TREADMILL)
                val out = JSArray()
                for (s in readAll(ExerciseSessionRecord::class, range)) {
                    if (s.exerciseType !in runTypes) continue
                    val origin = s.metadata.dataOrigin
                    val window = TimeRangeFilter.between(s.startTime, s.endTime)
                    val o = JSObject()
                        .put("id", s.metadata.id)
                        .put("date", s.startTime.atZone(zone).toLocalDate().toString())
                        .put("startTime", s.startTime.toString())
                        .put("durationSec", Duration.between(s.startTime, s.endTime).seconds)
                        .put("title", s.title ?: "")
                        .put("origin", origin.packageName)
                        .put("treadmill", s.exerciseType == ExerciseSessionRecord.EXERCISE_TYPE_RUNNING_TREADMILL)
                    if (granted.contains(perm(DistanceRecord::class))) {
                        val agg = client().aggregate(AggregateRequest(setOf(DistanceRecord.DISTANCE_TOTAL), window, setOf(origin)))
                        agg[DistanceRecord.DISTANCE_TOTAL]?.let { o.put("distanceM", it.inMeters) }
                    }
                    if (granted.contains(perm(HeartRateRecord::class))) {
                        val agg = client().aggregate(AggregateRequest(setOf(HeartRateRecord.BPM_AVG, HeartRateRecord.BPM_MAX), window, setOf(origin)))
                        agg[HeartRateRecord.BPM_AVG]?.let { o.put("avgHr", it) }
                        agg[HeartRateRecord.BPM_MAX]?.let { o.put("maxHr", it) }
                    }
                    out.put(o)
                }
                call.resolve(JSObject().put("runs", out))
            } catch (e: Exception) {
                call.reject(e.message ?: "Health Connect error")
            }
        }
    }
}
