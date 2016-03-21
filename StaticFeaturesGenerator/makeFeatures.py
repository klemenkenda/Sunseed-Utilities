import datetime

# header = "dayAfterHoliday;dayBeforeHoliday;dayOfMonth;dayOfWeek;dayOfYear;friday;holiday;monday;monthOfYear;saturday;sunday;thursday;timestamp;tuesday;wednesday;weekEnd;january;february;march;april;may;june;july;august;september;october;november;december"
header = "dayAfterHoliday;dayBeforeHoliday;dayOfMonth;dayOfWeek;dayOfYear;holiday;monthOfYear;timestamp;weekEnd"
headerList = header.split(";")
months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"]
days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]

## read holidays
with open("holidays.txt", "r") as h:
    holidaysStr = h.readlines();

startDate = datetime.datetime(2015, 1, 1, 0, 0, 0)
endDate = datetime.datetime(2017, 12, 31, 23, 0, 0)

if len(headerList) == 0: raise

holidays = []

f = '%Y-%m-%d\n'

for i in range(len(holidaysStr)):
    holidays.append(datetime.datetime.strptime(holidaysStr[i], f).date())

with open("staticFeatures.csv", "w") as f:
    f.write(header)
    f.write("\n")
    while startDate < endDate:
        for i in range(len(headerList)):
            field = headerList[i]

            ## special fields
            weekend = startDate.weekday() in [5, 6]
        
            
            #if field in days:
            #    f.write(str(int(startDate.weekday() == days.index(field))))
            #elif field in months:
            #    f.write(str(int(startDate.month == months.index(field) + 1)))
            # el
            if field == "dayOfYear":
                f.write(str(startDate.day))
            elif field == "dayOfMonth":
                f.write(str(startDate.timetuple().tm_yday))
            elif field == "dayOfWeek":
                f.write(str(startDate.weekday()))
            elif field == "timestamp":
                f.write(str(startDate))
            elif field == "monthOfYear":
                f.write(str(startDate.month))
            elif field == "weekEnd":
                f.write(str(int(weekend)))
            elif field == "holiday":
                f.write(str(int(startDate.date() in holidays)))
            elif field == "dayAfterHoliday":
                yesterday = startDate - datetime.timedelta(days = 1);
                f.write(str(int(yesterday.date() in holidays)))
            elif field == "dayBeforeHoliday":
                tomorrow = startDate + datetime.timedelta(days = 1);
                f.write(str(int(tomorrow.date() in holidays)))
            if i < len(headerList):
               f.write(";");

        f.write("\n")
        startDate += datetime.timedelta(hours = 1)